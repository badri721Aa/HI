/**
 * unity.ts — thin, cached helpers over frida-il2cpp-bridge for the Unity API.
 *
 * Rules that keep this fast and crash-free:
 *   • every Il2Cpp.Class lookup is cached,
 *   • structs (Vector3, Color, …) are built in Frida-owned memory (no GC races),
 *   • callers only cross into IL2CPP when something actually changed.
 */
import { log } from "./log.js";
import type { V3, Q, RGBA, V2 } from "./math.js";

export type Obj = Il2Cpp.Object;
export type VT = Il2Cpp.ValueType;
export type Cls = Il2Cpp.Class;

// ── class / image cache ────────────────────────────────────────────────────
const imageCache = new Map<string, Il2Cpp.Image | null>();
const classCache = new Map<string, Cls | null>();

export function image(assembly: string): Il2Cpp.Image | null {
    if (imageCache.has(assembly)) return imageCache.get(assembly)!;
    let img: Il2Cpp.Image | null = null;
    try { img = Il2Cpp.domain.tryAssembly(assembly)?.image ?? null; } catch { img = null; }
    imageCache.set(assembly, img);
    return img;
}

export function tryCls(assembly: string, name: string): Cls | null {
    const key = `${assembly}|${name}`;
    if (classCache.has(key)) return classCache.get(key)!;
    const img = image(assembly);
    let k: Cls | null = null;
    try { k = img ? img.tryClass(name) : null; } catch { k = null; }
    classCache.set(key, k);
    return k;
}

export function cls(assembly: string, name: string): Cls {
    const k = tryCls(assembly, name);
    if (!k) throw new Error(`class ${name} not found in ${assembly}`);
    return k;
}

const CORE = "UnityEngine.CoreModule";
const UIM = "UnityEngine.UIModule";
const UGUI = "UnityEngine.UI";
const TEXTR = "UnityEngine.TextRenderingModule";
const XRM = "UnityEngine.XRModule";
const TMP = "Unity.TextMeshPro";
const PHYS = "UnityEngine.PhysicsModule";

/** Lazily resolved Unity classes. Access throws with a clear message if missing. */
export const UE = {
    get GameObject() { return cls(CORE, "UnityEngine.GameObject"); },
    get Object() { return cls(CORE, "UnityEngine.Object"); },
    get Component() { return cls(CORE, "UnityEngine.Component"); },
    get Transform() { return cls(CORE, "UnityEngine.Transform"); },
    get RectTransform() { return cls(CORE, "UnityEngine.RectTransform"); },
    get Vector2() { return cls(CORE, "UnityEngine.Vector2"); },
    get Vector3() { return cls(CORE, "UnityEngine.Vector3"); },
    get Vector4() { return cls(CORE, "UnityEngine.Vector4"); },
    get Quaternion() { return cls(CORE, "UnityEngine.Quaternion"); },
    get Color() { return cls(CORE, "UnityEngine.Color"); },
    get Rect() { return cls(CORE, "UnityEngine.Rect"); },
    get Time() { return cls(CORE, "UnityEngine.Time"); },
    get Resources() { return cls(CORE, "UnityEngine.Resources"); },
    get Texture2D() { return cls(CORE, "UnityEngine.Texture2D"); },
    get Sprite() { return cls(CORE, "UnityEngine.Sprite"); },
    get Material() { return cls(CORE, "UnityEngine.Material"); },
    get Shader() { return cls(CORE, "UnityEngine.Shader"); },
    get Camera() { return cls(CORE, "UnityEngine.Camera"); },
    get Application() { return cls(CORE, "UnityEngine.Application"); },
    get PlayerPrefs() { return cls(CORE, "UnityEngine.PlayerPrefs"); },
    get LineRenderer() { return cls(CORE, "UnityEngine.LineRenderer"); },
    get Canvas() { return cls(UIM, "UnityEngine.Canvas"); },
    get CanvasGroup() { return cls(UIM, "UnityEngine.CanvasGroup"); },
    get CanvasScaler() { return cls(UGUI, "UnityEngine.UI.CanvasScaler"); },
    get RectMask2D() { return cls(UGUI, "UnityEngine.UI.RectMask2D"); },
    get Image() { return cls(UGUI, "UnityEngine.UI.Image"); },
    get Text() { return cls(UGUI, "UnityEngine.UI.Text"); },
    get Font() { return cls(TEXTR, "UnityEngine.Font"); },
    get InputDevices() { return cls(XRM, "UnityEngine.XR.InputDevices"); },
    get InputDevice() { return cls(XRM, "UnityEngine.XR.InputDevice"); },
    get CommonUsages() { return cls(XRM, "UnityEngine.XR.CommonUsages"); },
    get Collider() { return cls(PHYS, "UnityEngine.Collider"); },
    // optional
    get TextMeshProUGUI() { return tryCls(TMP, "TMPro.TextMeshProUGUI"); },
    get TMP_Settings() { return tryCls(TMP, "TMPro.TMP_Settings"); },
    get Keyboard() { return tryCls("Unity.InputSystem", "UnityEngine.InputSystem.Keyboard"); },
};

// ── strings & structs ──────────────────────────────────────────────────────
export const str = (s: string): Il2Cpp.String => Il2Cpp.string(s);

/** Allocates a value type in Frida memory and fills its fields. */
export function makeStruct(klass: Cls, fields: Record<string, number>): VT {
    const size = Math.max(klass.valueTypeSize, 4);
    const handle = Memory.alloc(size);
    const vt = new Il2Cpp.ValueType(handle, klass.type);
    for (const k in fields) vt.field<number>(k).value = fields[k];
    return vt;
}
export const vec2 = (x: number, y: number): VT => makeStruct(UE.Vector2, { x, y });
export const vec3 = (v: V3): VT => makeStruct(UE.Vector3, { x: v.x, y: v.y, z: v.z });
export const vec4 = (x: number, y: number, z: number, w: number): VT => makeStruct(UE.Vector4, { x, y, z, w });
export const quat = (q: Q): VT => makeStruct(UE.Quaternion, { x: q.x, y: q.y, z: q.z, w: q.w });
export const color = (c: RGBA): VT => makeStruct(UE.Color, { r: c.r, g: c.g, b: c.b, a: c.a });
export const rect = (x: number, y: number, w: number, h: number): VT =>
    makeStruct(UE.Rect, { m_XMin: x, m_YMin: y, m_Width: w, m_Height: h });

export const readV3 = (vt: VT): V3 => ({ x: vt.field<number>("x").value, y: vt.field<number>("y").value, z: vt.field<number>("z").value });
export const readV2 = (vt: VT): V2 => ({ x: vt.field<number>("x").value, y: vt.field<number>("y").value });
export const readQ = (vt: VT): Q => ({
    x: vt.field<number>("x").value, y: vt.field<number>("y").value,
    z: vt.field<number>("z").value, w: vt.field<number>("w").value,
});

// ── objects ────────────────────────────────────────────────────────────────
export function isNull(o: Obj | VT | null | undefined): boolean {
    return o == null || o.handle.isNull();
}

/** "Foo`1<Bar>" / "Foo`1[Bar]" / "Foo<Bar>" all compare equal. */
function normalizeTypeName(n: string): string {
    return n.replace(/`\d+/g, "").replace(/\[/g, "<").replace(/\]/g, ">").replace(/\s+/g, "");
}

/** Finds a method by exact parameter type names (handles overloads reliably). */
export function findMethod(klass: Cls, name: string, paramTypes: string[]): Il2Cpp.Method | null {
    for (const k of klass.hierarchy({ includeCurrent: true })) {
        for (const m of k.methods) {
            if (m.name !== name || m.parameterCount !== paramTypes.length) continue;
            const ps = m.parameters;
            let ok = true;
            for (let i = 0; i < ps.length; i++) {
                const tn = normalizeTypeName(ps[i].type.name);
                const want = normalizeTypeName(paramTypes[i]);
                if (tn === want) continue;
                // tolerate "T&" vs "T" spelling differences for by-ref params
                if (want.endsWith("&") && ps[i].type.isByReference && tn.replace(/&$/, "") === want.replace(/&$/, "")) continue;
                ok = false; break;
            }
            if (ok) return m;
        }
    }
    return null;
}

export function newGameObject(name: string, parent?: Obj | null): Obj {
    const go = UE.GameObject.new();
    go.method("set_name").invoke(str(name));
    if (parent && !isNull(parent)) setParent(transformOf(go), parent, false);
    return go;
}
export const transformOf = (go: Obj): Obj => go.method<Obj>("get_transform").invoke();
export const gameObjectOf = (component: Obj): Obj => component.method<Obj>("get_gameObject").invoke();
export const nameOf = (o: Obj): string => o.method<Il2Cpp.String>("get_name").invoke().content ?? "";
export const setName = (o: Obj, name: string): void => { o.method("set_name").invoke(str(name)); };
export function setParent(t: Obj, parent: Obj, worldPositionStays = false): void {
    t.method("SetParent", 2).invoke(parent, worldPositionStays);
}
export function addComponent(go: Obj, klass: Cls): Obj {
    return go.method<Obj>("AddComponent", 0).inflate(klass).invoke();
}
export function getComponent(go: Obj, klass: Cls): Obj | null {
    const c = go.method<Obj>("GetComponent", 0).inflate(klass).invoke();
    return isNull(c) ? null : c;
}
export function getOrAddComponent(go: Obj, klass: Cls): Obj {
    return getComponent(go, klass) ?? addComponent(go, klass);
}
export function destroy(o: Obj | null): void {
    if (!o || isNull(o)) return;
    try { UE.Object.method("Destroy", 1).invoke(o); } catch (e) { log.warn(`destroy failed: ${String(e)}`); }
}
export const dontDestroyOnLoad = (o: Obj): void => { UE.Object.method("DontDestroyOnLoad", 1).invoke(o); };
export const setActive = (go: Obj, active: boolean): void => { go.method("SetActive").invoke(active); };
export const isActiveSelf = (go: Obj): boolean => go.method<boolean>("get_activeSelf").invoke();
export const setLayer = (go: Obj, layer: number): void => { go.method("set_layer").invoke(layer); };
export const findGameObject = (name: string): Obj | null => {
    const go = UE.GameObject.method<Obj>("Find", 1).invoke(str(name));
    return isNull(go) ? null : go;
};
/** HideFlags.HideAndDontSave — keeps runtime assets (textures, sprites) alive across scene loads. */
export const HIDE_AND_DONT_SAVE = 61;
export const setHideFlags = (o: Obj, flags: number): void => { o.method("set_hideFlags").invoke(flags); };

// ── transforms ─────────────────────────────────────────────────────────────
export const getPosition = (t: Obj): V3 => readV3(t.method<VT>("get_position").invoke());
export const getRotation = (t: Obj): Q => readQ(t.method<VT>("get_rotation").invoke());
export const getLocalPosition = (t: Obj): V3 => readV3(t.method<VT>("get_localPosition").invoke());
export const getLossyScale = (t: Obj): V3 => readV3(t.method<VT>("get_lossyScale").invoke());
export const setPosition = (t: Obj, v: V3): void => { t.method("set_position").invoke(vec3(v)); };
export const setRotation = (t: Obj, q: Q): void => { t.method("set_rotation").invoke(quat(q)); };
export const setLocalPosition = (t: Obj, v: V3): void => { t.method("set_localPosition").invoke(vec3(v)); };
export const setLocalRotation = (t: Obj, q: Q): void => { t.method("set_localRotation").invoke(quat(q)); };
export const setLocalScale = (t: Obj, v: V3): void => { t.method("set_localScale").invoke(vec3(v)); };
export const setAsLastSibling = (t: Obj): void => { t.method("SetAsLastSibling").invoke(); };
export const setAsFirstSibling = (t: Obj): void => { t.method("SetAsFirstSibling").invoke(); };
export const setSiblingIndex = (t: Obj, i: number): void => { t.method("SetSiblingIndex").invoke(i); };

// ── RectTransform ──────────────────────────────────────────────────────────
export const rtSetAnchoredPosition = (rt: Obj, x: number, y: number): void => { rt.method("set_anchoredPosition").invoke(vec2(x, y)); };
export const rtSetSizeDelta = (rt: Obj, w: number, h: number): void => { rt.method("set_sizeDelta").invoke(vec2(w, h)); };
export const rtSetPivot = (rt: Obj, x: number, y: number): void => { rt.method("set_pivot").invoke(vec2(x, y)); };
export function rtSetAnchors(rt: Obj, minX: number, minY: number, maxX: number, maxY: number): void {
    rt.method("set_anchorMin").invoke(vec2(minX, minY));
    rt.method("set_anchorMax").invoke(vec2(maxX, maxY));
}
export function rtSetOffsets(rt: Obj, left: number, bottom: number, right: number, top: number): void {
    rt.method("set_offsetMin").invoke(vec2(left, bottom));
    rt.method("set_offsetMax").invoke(vec2(right, top));
}
/** Anchor top-left, pivot top-left, y measured downwards. */
export function rtTopLeft(rt: Obj, x: number, y: number, w: number, h: number): void {
    rtSetAnchors(rt, 0, 1, 0, 1);
    rtSetPivot(rt, 0, 1);
    rtSetAnchoredPosition(rt, x, -y);
    rtSetSizeDelta(rt, w, h);
}
/** Stretch to parent with margins (left, top, right, bottom). */
export function rtStretch(rt: Obj, l = 0, t = 0, r = 0, b = 0): void {
    rtSetAnchors(rt, 0, 0, 1, 1);
    rtSetPivot(rt, 0.5, 0.5);
    rtSetOffsets(rt, l, b, -r, -t);
}
export const rtSetLocalScale = (rt: Obj, s: number): void => { setLocalScale(rt, { x: s, y: s, z: s }); };
export const rtSetLocalEuler = (rt: Obj, x: number, y: number, z: number): void => { rt.method("set_localEulerAngles").invoke(vec3({ x, y, z })); };

// ── time / camera / misc ──────────────────────────────────────────────────
export const unscaledDeltaTime = (): number => UE.Time.method<number>("get_unscaledDeltaTime").invoke();
export const realtimeSinceStartup = (): number => UE.Time.method<number>("get_realtimeSinceStartup").invoke();
export const frameCount = (): number => UE.Time.method<number>("get_frameCount").invoke();
export function mainCamera(): Obj | null {
    const c = UE.Camera.method<Obj>("get_main").invoke();
    return isNull(c) ? null : c;
}
export function shaderFind(name: string): Obj | null {
    const s = UE.Shader.method<Obj>("Find", 1).invoke(str(name));
    return isNull(s) ? null : s;
}
/** Creates a Material from the first shader name that exists. */
export function newMaterial(shaderNames: string[]): Obj | null {
    for (const n of shaderNames) {
        const sh = shaderFind(n);
        if (!sh) continue;
        try {
            const mat = UE.Material.alloc();
            UE.Material.method("CreateWithShader", 2).invoke(mat, sh);
            return mat;
        } catch (e) { log.warn(`material(${n}) failed: ${String(e)}`); }
    }
    return null;
}
export function builtinFont(): Obj | null {
    for (const name of ["LegacyRuntime.ttf", "Arial.ttf"]) {
        try {
            const f = UE.Resources.method<Obj>("GetBuiltinResource", 1).inflate(UE.Font).invoke(str(name));
            if (!isNull(f)) return f;
        } catch { /* try next */ }
    }
    return null;
}

// ── PlayerPrefs ────────────────────────────────────────────────────────────
export const prefsGet = (key: string, def = ""): string =>
    UE.PlayerPrefs.method<Il2Cpp.String>("GetString", 2).invoke(str(key), str(def)).content ?? def;
export function prefsSet(key: string, value: string): void {
    UE.PlayerPrefs.method("SetString", 2).invoke(str(key), str(value));
    UE.PlayerPrefs.method("Save", 0).invoke();
}
export const prefsDelete = (key: string): void => { UE.PlayerPrefs.method("DeleteKey", 1).invoke(str(key)); };
