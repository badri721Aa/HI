/**
 * ac.ts — the ONLY file that knows Animal Company's class names.
 *
 * Adapting the template to another Unity VR game = editing this file.
 * Names come from the game's IL2CPP dump (Comet.PC / OrbitMenu community dumps).
 */
export const GAME = {
    /** Main game assembly (Assembly-CSharp is renamed to "AnimalCompany"). */
    assembly: "AnimalCompany",
    /** Process / package names for the launchers. */
    pcProcess: "AnimalCompany.exe",
    questPackage: "com.AnimalCompany.AnimalCompany",

    /** Candidate providers for head / hand transforms, tried in order. */
    rigs: [
        {
            name: "GorillaLocomotion",
            klass: "AnimalCompany.GorillaLocomotion",
            instanceField: "<Instance>k__BackingField",
            left: "leftHandTransform",
            right: "rightHandTransform",
            /** Component whose transform is the head (a Collider here). */
            headComponent: "headCollider",
        },
        {
            name: "PlayerController",
            klass: "AnimalCompany.PlayerController",
            instanceField: "_instance",
            left: "_controllerTransformLeft",
            right: "_controllerTransformRight",
            head: "_headTransform",
            headAlt: "_cameraTransform",
        },
        {
            name: "NetPlayer",
            klass: "AnimalCompany.NetPlayer",
            instanceField: "_localPlayer",
            left: "handLeft",
            right: "handRight",
            head: "head",
        },
    ],

    /** Static Camera accessor used as the final head fallback. */
    cameraManager: { klass: "AnimalCompany.CameraManager", getter: "get_main" },

    /** Per-frame hook candidates (class, method, assembly). First that exists wins. */
    frameHooks: [
        { assembly: "AnimalCompany", klass: "AnimalCompany.GorillaLocomotion", method: "LateUpdate" },
        { assembly: "AnimalCompany", klass: "AnimalCompany.GorillaLocomotion", method: "Update" },
        { assembly: "AnimalCompany", klass: "AnimalCompany.PlayerController", method: "Update" },
        { assembly: "UnityEngine.UIModule", klass: "UnityEngine.Canvas", method: "SendWillRenderCanvases" },
        { assembly: "UnityEngine.CoreModule", klass: "UnityEngine.Application", method: "InvokeOnBeforeRender" },
    ],

    /** GameObject names tried when no rig class matched (OVR / XRI defaults). */
    genericNames: {
        left: ["LeftHandAnchor", "LeftControllerAnchor", "LeftHand Controller", "Left Controller", "LeftHand"],
        right: ["RightHandAnchor", "RightControllerAnchor", "RightHand Controller", "Right Controller", "RightHand"],
        head: ["CenterEyeAnchor", "Main Camera", "MainCamera", "Camera"],
    },
};
