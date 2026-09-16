📦
304916 /src/index.js
✄
// node_modules/frida-il2cpp-bridge/dist/index.js
var __decorate = function(decorators, target, key, desc) {
  var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
  if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
  else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
  return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var Il2Cpp2;
(function(Il2Cpp3) {
  Il2Cpp3.application = {
    /**
     * Gets the data path name of the current application, e.g.
     * `/data/emulated/0/Android/data/com.example.application/files`
     * on Android.
     *
     * **This information is not guaranteed to exist.**
     *
     * ```ts
     * Il2Cpp.perform(() => {
     *     // prints /data/emulated/0/Android/data/com.example.application/files
     *     console.log(Il2Cpp.application.dataPath);
     * });
     * ```
     */
    get dataPath() {
      return unityEngineCall("get_persistentDataPath");
    },
    /**
     * Gets the identifier name of the current application, e.g.
     * `com.example.application` on Android.
     *
     * In case the identifier cannot be retrieved, the main module name is
     * returned instead, which typically is the process name.
     *
     * ```ts
     * Il2Cpp.perform(() => {
     *     // prints com.example.application
     *     console.log(Il2Cpp.application.identifier);
     * });
     * ```
     */
    get identifier() {
      return unityEngineCall("get_identifier") ?? unityEngineCall("get_bundleIdentifier") ?? Process.mainModule.name;
    },
    /**
     * Gets the version name of the current application, e.g. `4.12.8`.
     *
     * In case the version cannot be retrieved, an hash of the IL2CPP
     * module is returned instead.
     *
     * ```ts
     * Il2Cpp.perform(() => {
     *     // prints 4.12.8
     *     console.log(Il2Cpp.application.version);
     * });
     * ```
     */
    get version() {
      return unityEngineCall("get_version") ?? Il2Cpp3.module.enumerateSections().reduce((checksum, section) => {
        return [".text", "__text"].includes(section.name) ? checksum.update(ArrayBuffer.wrap(section.address, section.size)) : checksum;
      }, new Checksum("md5")).getString();
    }
  };
  getter(Il2Cpp3, "unityVersion", () => {
    try {
      const unityVersion = Il2Cpp3.$config.unityVersion ?? unityEngineCall("get_unityVersion");
      if (unityVersion != null) {
        return unityVersion;
      }
    } catch (_) {
    }
    const rangeProvider = function* () {
      yield* Il2Cpp3.module.enumerateSections().filter((_) => _.name == ".rodata" || _.name == ".rdata" || _.name == "__TEXT").map((_) => ({ base: _.address, size: _.size }));
      yield* Il2Cpp3.module.enumerateRanges("r--");
      yield* Process.enumerateRanges("r--").filter((_) => _.file != void 0 && _.file.path != Il2Cpp3.module.path);
    };
    for (const range of rangeProvider()) {
      let matches;
      try {
        matches = Memory.scanSync(range.base, range.size, "69 6c 32 63 70 70");
      } catch (_) {
        continue;
      }
      for (let { address } of matches) {
        while (address.readU8() != 0) {
          address = address.sub(1);
        }
        const match = UnityVersion.find(address.add(1).readCString());
        if (match != void 0) {
          return match;
        }
      }
    }
    raise("couldn't determine the Unity version, please specify it manually");
  }, lazy);
  function unityEngineCall(method) {
    const icallHandle = Il2Cpp3.exports.resolveInternalCall(Memory.allocUtf8String("UnityEngine.Application::" + method));
    return (icallHandle.isNull() ? Il2Cpp3.domain.tryAssembly("UnityEngine.CoreModule")?.image?.tryClass("UnityEngine.Application")?.tryMethod(method)?.invoke() : new Il2Cpp3.String(new NativeFunction(icallHandle, "pointer", [])()))?.asNullable()?.content ?? null;
  }
})(Il2Cpp2 || (Il2Cpp2 = {}));
var Il2Cpp2;
(function(Il2Cpp3) {
  function boxed(value, type) {
    const mapping = {
      int8: "System.SByte",
      uint8: "System.Byte",
      int16: "System.Int16",
      uint16: "System.UInt16",
      int32: "System.Int32",
      uint32: "System.UInt32",
      int64: "System.Int64",
      uint64: "System.UInt64",
      char: "System.Char",
      intptr: "System.IntPtr",
      uintptr: "System.UIntPtr"
    };
    const className = typeof value == "boolean" ? "System.Boolean" : typeof value == "number" ? mapping[type ?? "int32"] : value instanceof Int64 ? "System.Int64" : value instanceof UInt64 ? "System.UInt64" : value instanceof NativePointer ? mapping[type ?? "intptr"] : raise(`Cannot create boxed primitive using value of type '${typeof value}'`);
    const object = Il2Cpp3.corlib.class(className ?? raise(`Unknown primitive type name '${type}'`)).alloc();
    (object.tryField("m_value") ?? object.tryField("_pointer") ?? raise(`Could not find primitive field in class '${className}'`)).value = value;
    return object;
  }
  Il2Cpp3.boxed = boxed;
})(Il2Cpp2 || (Il2Cpp2 = {}));
var Il2Cpp2;
(function(Il2Cpp3) {
  Il2Cpp3.$config = {
    moduleName: void 0,
    unityVersion: void 0,
    exports: void 0
  };
})(Il2Cpp2 || (Il2Cpp2 = {}));
var Il2Cpp2;
(function(Il2Cpp3) {
  function installExceptionListener(targetThread = "current") {
    const currentThread = Il2Cpp3.exports.threadGetCurrent();
    return Interceptor.attach(Il2Cpp3.module.getExportByName("__cxa_throw"), function(args) {
      if (targetThread == "current" && !Il2Cpp3.exports.threadGetCurrent().equals(currentThread)) {
        return;
      }
      inform(new Il2Cpp3.Object(args[0].readPointer()));
    });
  }
  Il2Cpp3.installExceptionListener = installExceptionListener;
})(Il2Cpp2 || (Il2Cpp2 = {}));
var Il2Cpp2;
(function(Il2Cpp3) {
  Il2Cpp3.exports = {
    get alloc() {
      return r("il2cpp_alloc", "pointer", ["size_t"]);
    },
    get arrayGetLength() {
      return r("il2cpp_array_length", "uint32", ["pointer"]);
    },
    get arrayNew() {
      return r("il2cpp_array_new", "pointer", ["pointer", "uint32"]);
    },
    get assemblyGetImage() {
      return r("il2cpp_assembly_get_image", "pointer", ["pointer"]);
    },
    get classForEach() {
      return r("il2cpp_class_for_each", "void", ["pointer", "pointer"]);
    },
    get classFromName() {
      return r("il2cpp_class_from_name", "pointer", ["pointer", "pointer", "pointer"]);
    },
    get classFromObject() {
      return r("il2cpp_class_from_system_type", "pointer", ["pointer"]);
    },
    get classGetArrayClass() {
      return r("il2cpp_array_class_get", "pointer", ["pointer", "uint32"]);
    },
    get classGetArrayElementSize() {
      return r("il2cpp_class_array_element_size", "int", ["pointer"]);
    },
    get classGetAssemblyName() {
      return r("il2cpp_class_get_assemblyname", "pointer", ["pointer"]);
    },
    get classGetBaseType() {
      return r("il2cpp_class_enum_basetype", "pointer", ["pointer"]);
    },
    get classGetDeclaringType() {
      return r("il2cpp_class_get_declaring_type", "pointer", ["pointer"]);
    },
    get classGetElementClass() {
      return r("il2cpp_class_get_element_class", "pointer", ["pointer"]);
    },
    get classGetFieldFromName() {
      return r("il2cpp_class_get_field_from_name", "pointer", ["pointer", "pointer"]);
    },
    get classGetFields() {
      return r("il2cpp_class_get_fields", "pointer", ["pointer", "pointer"]);
    },
    get classGetFlags() {
      return r("il2cpp_class_get_flags", "int", ["pointer"]);
    },
    get classGetImage() {
      return r("il2cpp_class_get_image", "pointer", ["pointer"]);
    },
    get classGetInstanceSize() {
      return r("il2cpp_class_instance_size", "int32", ["pointer"]);
    },
    get classGetInterfaces() {
      return r("il2cpp_class_get_interfaces", "pointer", ["pointer", "pointer"]);
    },
    get classGetMethodFromName() {
      return r("il2cpp_class_get_method_from_name", "pointer", ["pointer", "pointer", "int"]);
    },
    get classGetMethods() {
      return r("il2cpp_class_get_methods", "pointer", ["pointer", "pointer"]);
    },
    get classGetName() {
      return r("il2cpp_class_get_name", "pointer", ["pointer"]);
    },
    get classGetNamespace() {
      return r("il2cpp_class_get_namespace", "pointer", ["pointer"]);
    },
    get classGetNestedClasses() {
      return r("il2cpp_class_get_nested_types", "pointer", ["pointer", "pointer"]);
    },
    get classGetParent() {
      return r("il2cpp_class_get_parent", "pointer", ["pointer"]);
    },
    get classGetStaticFieldData() {
      return r("il2cpp_class_get_static_field_data", "pointer", ["pointer"]);
    },
    get classGetValueTypeSize() {
      return r("il2cpp_class_value_size", "int32", ["pointer", "pointer"]);
    },
    get classGetType() {
      return r("il2cpp_class_get_type", "pointer", ["pointer"]);
    },
    get classHasReferences() {
      return r("il2cpp_class_has_references", "bool", ["pointer"]);
    },
    get classInitialize() {
      return r("il2cpp_runtime_class_init", "void", ["pointer"]);
    },
    get classIsAbstract() {
      return r("il2cpp_class_is_abstract", "bool", ["pointer"]);
    },
    get classIsAssignableFrom() {
      return r("il2cpp_class_is_assignable_from", "bool", ["pointer", "pointer"]);
    },
    get classIsBlittable() {
      return r("il2cpp_class_is_blittable", "bool", ["pointer"]);
    },
    get classIsEnum() {
      return r("il2cpp_class_is_enum", "bool", ["pointer"]);
    },
    get classIsGeneric() {
      return r("il2cpp_class_is_generic", "bool", ["pointer"]);
    },
    get classIsInflated() {
      return r("il2cpp_class_is_inflated", "bool", ["pointer"]);
    },
    get classIsInterface() {
      return r("il2cpp_class_is_interface", "bool", ["pointer"]);
    },
    get classIsSubclassOf() {
      return r("il2cpp_class_is_subclass_of", "bool", ["pointer", "pointer", "bool"]);
    },
    get classIsValueType() {
      return r("il2cpp_class_is_valuetype", "bool", ["pointer"]);
    },
    get domainGetAssemblyFromName() {
      return r("il2cpp_domain_assembly_open", "pointer", ["pointer", "pointer"]);
    },
    get domainGet() {
      return r("il2cpp_domain_get", "pointer", []);
    },
    get domainGetAssemblies() {
      return r("il2cpp_domain_get_assemblies", "pointer", ["pointer", "pointer"]);
    },
    get fieldGetClass() {
      return r("il2cpp_field_get_parent", "pointer", ["pointer"]);
    },
    get fieldGetFlags() {
      return r("il2cpp_field_get_flags", "int", ["pointer"]);
    },
    get fieldGetName() {
      return r("il2cpp_field_get_name", "pointer", ["pointer"]);
    },
    get fieldGetOffset() {
      return r("il2cpp_field_get_offset", "int32", ["pointer"]);
    },
    get fieldGetStaticValue() {
      return r("il2cpp_field_static_get_value", "void", ["pointer", "pointer"]);
    },
    get fieldGetType() {
      return r("il2cpp_field_get_type", "pointer", ["pointer"]);
    },
    get fieldSetStaticValue() {
      return r("il2cpp_field_static_set_value", "void", ["pointer", "pointer"]);
    },
    get free() {
      return r("il2cpp_free", "void", ["pointer"]);
    },
    get gcCollect() {
      return r("il2cpp_gc_collect", "void", ["int"]);
    },
    get gcCollectALittle() {
      return r("il2cpp_gc_collect_a_little", "void", []);
    },
    get gcDisable() {
      return r("il2cpp_gc_disable", "void", []);
    },
    get gcEnable() {
      return r("il2cpp_gc_enable", "void", []);
    },
    get gcForEachHeap() {
      return r("il2cpp_gc_foreach_heap", "void", ["pointer", "pointer"]);
    },
    get gcGetHeapSize() {
      return r("il2cpp_gc_get_heap_size", "int64", []);
    },
    get gcGetMaxTimeSlice() {
      return r("il2cpp_gc_get_max_time_slice_ns", "int64", []);
    },
    get gcGetUsedSize() {
      return r("il2cpp_gc_get_used_size", "int64", []);
    },
    get gcHandleGetTarget() {
      return r("il2cpp_gchandle_get_target", "pointer", ["uint32"]);
    },
    get gcHandleFree() {
      return r("il2cpp_gchandle_free", "void", ["uint32"]);
    },
    get gcHandleNew() {
      return r("il2cpp_gchandle_new", "uint32", ["pointer", "bool"]);
    },
    get gcHandleNewWeakRef() {
      return r("il2cpp_gchandle_new_weakref", "uint32", ["pointer", "bool"]);
    },
    get gcIsDisabled() {
      return r("il2cpp_gc_is_disabled", "bool", []);
    },
    get gcIsIncremental() {
      return r("il2cpp_gc_is_incremental", "bool", []);
    },
    get gcSetMaxTimeSlice() {
      return r("il2cpp_gc_set_max_time_slice_ns", "void", ["int64"]);
    },
    get gcStartIncrementalCollection() {
      return r("il2cpp_gc_start_incremental_collection", "void", []);
    },
    get gcStartWorld() {
      return r("il2cpp_start_gc_world", "void", []);
    },
    get gcStopWorld() {
      return r("il2cpp_stop_gc_world", "void", []);
    },
    get getCorlib() {
      return r("il2cpp_get_corlib", "pointer", []);
    },
    get imageGetAssembly() {
      return r("il2cpp_image_get_assembly", "pointer", ["pointer"]);
    },
    get imageGetClass() {
      return r("il2cpp_image_get_class", "pointer", ["pointer", "uint"]);
    },
    get imageGetClassCount() {
      return r("il2cpp_image_get_class_count", "uint32", ["pointer"]);
    },
    get imageGetName() {
      return r("il2cpp_image_get_name", "pointer", ["pointer"]);
    },
    get initialize() {
      return r("il2cpp_init", "void", ["pointer"]);
    },
    get livenessAllocateStruct() {
      return r("il2cpp_unity_liveness_allocate_struct", "pointer", ["pointer", "int", "pointer", "pointer", "pointer"]);
    },
    get livenessCalculationBegin() {
      return r("il2cpp_unity_liveness_calculation_begin", "pointer", ["pointer", "int", "pointer", "pointer", "pointer", "pointer"]);
    },
    get livenessCalculationEnd() {
      return r("il2cpp_unity_liveness_calculation_end", "void", ["pointer"]);
    },
    get livenessCalculationFromStatics() {
      return r("il2cpp_unity_liveness_calculation_from_statics", "void", ["pointer"]);
    },
    get livenessFinalize() {
      return r("il2cpp_unity_liveness_finalize", "void", ["pointer"]);
    },
    get livenessFreeStruct() {
      return r("il2cpp_unity_liveness_free_struct", "void", ["pointer"]);
    },
    get memorySnapshotCapture() {
      return r("il2cpp_capture_memory_snapshot", "pointer", []);
    },
    get memorySnapshotFree() {
      return r("il2cpp_free_captured_memory_snapshot", "void", ["pointer"]);
    },
    get memorySnapshotGetClasses() {
      return r("il2cpp_memory_snapshot_get_classes", "pointer", ["pointer", "pointer"]);
    },
    get memorySnapshotGetObjects() {
      return r("il2cpp_memory_snapshot_get_objects", "pointer", ["pointer", "pointer"]);
    },
    get methodGetClass() {
      return r("il2cpp_method_get_class", "pointer", ["pointer"]);
    },
    get methodGetFlags() {
      return r("il2cpp_method_get_flags", "uint32", ["pointer", "pointer"]);
    },
    get methodGetName() {
      return r("il2cpp_method_get_name", "pointer", ["pointer"]);
    },
    get methodGetObject() {
      return r("il2cpp_method_get_object", "pointer", ["pointer", "pointer"]);
    },
    get methodGetParameterCount() {
      return r("il2cpp_method_get_param_count", "uint8", ["pointer"]);
    },
    get methodGetParameterName() {
      return r("il2cpp_method_get_param_name", "pointer", ["pointer", "uint32"]);
    },
    get methodGetParameters() {
      return r("il2cpp_method_get_parameters", "pointer", ["pointer", "pointer"]);
    },
    get methodGetParameterType() {
      return r("il2cpp_method_get_param", "pointer", ["pointer", "uint32"]);
    },
    get methodGetReturnType() {
      return r("il2cpp_method_get_return_type", "pointer", ["pointer"]);
    },
    get methodIsGeneric() {
      return r("il2cpp_method_is_generic", "bool", ["pointer"]);
    },
    get methodIsInflated() {
      return r("il2cpp_method_is_inflated", "bool", ["pointer"]);
    },
    get methodIsInstance() {
      return r("il2cpp_method_is_instance", "bool", ["pointer"]);
    },
    get monitorEnter() {
      return r("il2cpp_monitor_enter", "void", ["pointer"]);
    },
    get monitorExit() {
      return r("il2cpp_monitor_exit", "void", ["pointer"]);
    },
    get monitorPulse() {
      return r("il2cpp_monitor_pulse", "void", ["pointer"]);
    },
    get monitorPulseAll() {
      return r("il2cpp_monitor_pulse_all", "void", ["pointer"]);
    },
    get monitorTryEnter() {
      return r("il2cpp_monitor_try_enter", "bool", ["pointer", "uint32"]);
    },
    get monitorTryWait() {
      return r("il2cpp_monitor_try_wait", "bool", ["pointer", "uint32"]);
    },
    get monitorWait() {
      return r("il2cpp_monitor_wait", "void", ["pointer"]);
    },
    get objectGetClass() {
      return r("il2cpp_object_get_class", "pointer", ["pointer"]);
    },
    get objectGetVirtualMethod() {
      return r("il2cpp_object_get_virtual_method", "pointer", ["pointer", "pointer"]);
    },
    get objectInitialize() {
      return r("il2cpp_runtime_object_init_exception", "void", ["pointer", "pointer"]);
    },
    get objectNew() {
      return r("il2cpp_object_new", "pointer", ["pointer"]);
    },
    get objectGetSize() {
      return r("il2cpp_object_get_size", "uint32", ["pointer"]);
    },
    get objectUnbox() {
      return r("il2cpp_object_unbox", "pointer", ["pointer"]);
    },
    get resolveInternalCall() {
      return r("il2cpp_resolve_icall", "pointer", ["pointer"]);
    },
    get stringGetChars() {
      return r("il2cpp_string_chars", "pointer", ["pointer"]);
    },
    get stringGetLength() {
      return r("il2cpp_string_length", "int32", ["pointer"]);
    },
    get stringNew() {
      return r("il2cpp_string_new", "pointer", ["pointer"]);
    },
    get valueTypeBox() {
      return r("il2cpp_value_box", "pointer", ["pointer", "pointer"]);
    },
    get threadAttach() {
      return r("il2cpp_thread_attach", "pointer", ["pointer"]);
    },
    get threadDetach() {
      return r("il2cpp_thread_detach", "void", ["pointer"]);
    },
    get threadGetAttachedThreads() {
      return r("il2cpp_thread_get_all_attached_threads", "pointer", ["pointer"]);
    },
    get threadGetCurrent() {
      return r("il2cpp_thread_current", "pointer", []);
    },
    get threadIsVm() {
      return r("il2cpp_is_vm_thread", "bool", ["pointer"]);
    },
    get typeEquals() {
      return r("il2cpp_type_equals", "bool", ["pointer", "pointer"]);
    },
    get typeGetClass() {
      return r("il2cpp_class_from_type", "pointer", ["pointer"]);
    },
    get typeGetName() {
      return r("il2cpp_type_get_name", "pointer", ["pointer"]);
    },
    get typeGetObject() {
      return r("il2cpp_type_get_object", "pointer", ["pointer"]);
    },
    get typeGetTypeEnum() {
      return r("il2cpp_type_get_type", "int", ["pointer"]);
    }
  };
  decorate(Il2Cpp3.exports, lazy);
  getter(Il2Cpp3, "memorySnapshotExports", () => new CModule("#include <stdint.h>\n#include <string.h>\n\ntypedef struct Il2CppManagedMemorySnapshot Il2CppManagedMemorySnapshot;\ntypedef struct Il2CppMetadataType Il2CppMetadataType;\n\nstruct Il2CppManagedMemorySnapshot\n{\n  struct Il2CppManagedHeap\n  {\n    uint32_t section_count;\n    void * sections;\n  } heap;\n  struct Il2CppStacks\n  {\n    uint32_t stack_count;\n    void * stacks;\n  } stacks;\n  struct Il2CppMetadataSnapshot\n  {\n    uint32_t type_count;\n    Il2CppMetadataType * types;\n  } metadata_snapshot;\n  struct Il2CppGCHandles\n  {\n    uint32_t tracked_object_count;\n    void ** pointers_to_objects;\n  } gc_handles;\n  struct Il2CppRuntimeInformation\n  {\n    uint32_t pointer_size;\n    uint32_t object_header_size;\n    uint32_t array_header_size;\n    uint32_t array_bounds_offset_in_header;\n    uint32_t array_size_offset_in_header;\n    uint32_t allocation_granularity;\n  } runtime_information;\n  void * additional_user_information;\n};\n\nstruct Il2CppMetadataType\n{\n  uint32_t flags;\n  void * fields;\n  uint32_t field_count;\n  uint32_t statics_size;\n  uint8_t * statics;\n  uint32_t base_or_element_type_index;\n  char * name;\n  const char * assembly_name;\n  uint64_t type_info_address;\n  uint32_t size;\n};\n\nuintptr_t\nil2cpp_memory_snapshot_get_classes (\n    const Il2CppManagedMemorySnapshot * snapshot, Il2CppMetadataType ** iter)\n{\n  const int zero = 0;\n  const void * null = 0;\n\n  if (iter != NULL && snapshot->metadata_snapshot.type_count > zero)\n  {\n    if (*iter == null)\n    {\n      *iter = snapshot->metadata_snapshot.types;\n      return (uintptr_t) (*iter)->type_info_address;\n    }\n    else\n    {\n      Il2CppMetadataType * metadata_type = *iter + 1;\n\n      if (metadata_type < snapshot->metadata_snapshot.types +\n                              snapshot->metadata_snapshot.type_count)\n      {\n        *iter = metadata_type;\n        return (uintptr_t) (*iter)->type_info_address;\n      }\n    }\n  }\n  return 0;\n}\n\nvoid **\nil2cpp_memory_snapshot_get_objects (\n    const Il2CppManagedMemorySnapshot * snapshot, uint32_t * size)\n{\n  *size = snapshot->gc_handles.tracked_object_count;\n  return snapshot->gc_handles.pointers_to_objects;\n}\n"), lazy);
  function r(exportName, retType, argTypes) {
    const handle = Il2Cpp3.$config.exports?.[exportName]?.() ?? Il2Cpp3.module.findExportByName(exportName) ?? Il2Cpp3.memorySnapshotExports[exportName];
    const target = new NativeFunction(handle ?? NULL, retType, argTypes);
    return target.isNull() ? new Proxy(target, {
      get(value, name) {
        const property = value[name];
        return typeof property === "function" ? property.bind(value) : property;
      },
      apply() {
        if (handle == null) {
          raise(`couldn't resolve export ${exportName}`);
        } else if (handle.isNull()) {
          raise(`export ${exportName} points to NULL IL2CPP library has likely been stripped, obfuscated, or customized`);
        }
      }
    }) : target;
  }
})(Il2Cpp2 || (Il2Cpp2 = {}));
var Il2Cpp2;
(function(Il2Cpp3) {
  function is(klass) {
    return (element) => {
      if (element instanceof Il2Cpp3.Class) {
        return klass.isAssignableFrom(element);
      } else {
        return klass.isAssignableFrom(element.class);
      }
    };
  }
  Il2Cpp3.is = is;
  function isExactly(klass) {
    return (element) => {
      if (element instanceof Il2Cpp3.Class) {
        return element.equals(klass);
      } else {
        return element.class.equals(klass);
      }
    };
  }
  Il2Cpp3.isExactly = isExactly;
})(Il2Cpp2 || (Il2Cpp2 = {}));
var Il2Cpp2;
(function(Il2Cpp3) {
  Il2Cpp3.gc = {
    /**
     * Gets the allocated heap sections managed by IL2CPP.
     */
    get heapSections() {
      const ranges = [];
      Il2Cpp3.exports.gcForEachHeap(new NativeCallback((data, _) => {
        ranges.push({
          base: data.readPointer(),
          size: data.add(Process.pointerSize).readU32()
        });
      }, "void", ["pointer", "pointer"]), NULL);
      return ranges;
    },
    /**
     * Gets the heap size in bytes.
     */
    get heapSize() {
      return Il2Cpp3.exports.gcGetHeapSize();
    },
    /**
     * Determines whether the garbage collector is enabled.
     */
    get isEnabled() {
      return !Il2Cpp3.exports.gcIsDisabled();
    },
    /**
     * Determines whether the garbage collector is incremental
     * ([source](https://docs.unity3d.com/Manual/performance-incremental-garbage-collection.html)).
     */
    get isIncremental() {
      return !!Il2Cpp3.exports.gcIsIncremental();
    },
    /**
     * Gets the number of nanoseconds the garbage collector can spend in a
     * collection step.
     */
    get maxTimeSlice() {
      return Il2Cpp3.exports.gcGetMaxTimeSlice();
    },
    /**
     * Gets the used heap size in bytes.
     */
    get usedHeapSize() {
      return Il2Cpp3.exports.gcGetUsedSize();
    },
    /**
     * Enables or disables the garbage collector.
     */
    set isEnabled(value) {
      value ? Il2Cpp3.exports.gcEnable() : Il2Cpp3.exports.gcDisable();
    },
    /**
     *  Sets the number of nanoseconds the garbage collector can spend in
     * a collection step.
     */
    set maxTimeSlice(nanoseconds) {
      Il2Cpp3.exports.gcSetMaxTimeSlice(nanoseconds);
    },
    /**
     * Returns the heap allocated objects of the specified class. \
     * This variant reads GC descriptors.
     */
    choose(klass) {
      const matches = [];
      const callback = (objects, size) => {
        for (let i = 0; i < size; i++) {
          matches.push(new Il2Cpp3.Object(objects.add(i * Process.pointerSize).readPointer()));
        }
      };
      const chooseCallback = new NativeCallback(callback, "void", ["pointer", "int", "pointer"]);
      if (!Il2Cpp3.exports.livenessCalculationBegin.isNull()) {
        const onWorld = new NativeCallback(() => {
        }, "void", []);
        const state = Il2Cpp3.exports.livenessCalculationBegin(klass, 0, chooseCallback, NULL, onWorld, onWorld);
        Il2Cpp3.exports.livenessCalculationFromStatics(state);
        Il2Cpp3.exports.livenessCalculationEnd(state);
      } else {
        const realloc = (handle, size) => {
          if (!handle.isNull() && size.compare(0) == 0) {
            Il2Cpp3.free(handle);
            return NULL;
          } else {
            return Il2Cpp3.alloc(size);
          }
        };
        const reallocCallback = new NativeCallback(realloc, "pointer", ["pointer", "size_t", "pointer"]);
        this.stopWorld();
        const state = Il2Cpp3.exports.livenessAllocateStruct(klass, 0, chooseCallback, NULL, reallocCallback);
        Il2Cpp3.exports.livenessCalculationFromStatics(state);
        Il2Cpp3.exports.livenessFinalize(state);
        this.startWorld();
        Il2Cpp3.exports.livenessFreeStruct(state);
      }
      return matches;
    },
    /**
     * Forces a garbage collection of the specified generation.
     */
    collect(generation) {
      Il2Cpp3.exports.gcCollect(generation < 0 ? 0 : generation > 2 ? 2 : generation);
    },
    /**
     * Forces a garbage collection.
     */
    collectALittle() {
      Il2Cpp3.exports.gcCollectALittle();
    },
    /**
     *  Resumes all the previously stopped threads.
     */
    startWorld() {
      return Il2Cpp3.exports.gcStartWorld();
    },
    /**
     * Performs an incremental garbage collection.
     */
    startIncrementalCollection() {
      return Il2Cpp3.exports.gcStartIncrementalCollection();
    },
    /**
     * Stops all threads which may access the garbage collected heap, other
     * than the caller.
     */
    stopWorld() {
      return Il2Cpp3.exports.gcStopWorld();
    }
  };
})(Il2Cpp2 || (Il2Cpp2 = {}));
var Android;
(function(Android2) {
  getter(Android2, "apiLevel", () => {
    const value = getProperty("ro.build.version.sdk");
    return value ? parseInt(value) : null;
  }, lazy);
  function getProperty(name) {
    const handle = Process.findModuleByName("libc.so")?.findExportByName("__system_property_get");
    if (handle) {
      const __system_property_get = new NativeFunction(handle, "void", ["pointer", "pointer"]);
      const value = Memory.alloc(92).writePointer(NULL);
      __system_property_get(Memory.allocUtf8String(name), value);
      return value.readCString() ?? void 0;
    }
  }
})(Android || (Android = {}));
function raise(message) {
  const error = new Error(message);
  error.name = "Il2CppError";
  error.stack = error.stack?.replace(/^(Il2Cpp)?Error/, "\x1B[0m\x1B[38;5;9mil2cpp\x1B[0m")?.replace(/\n    at (.+) \((.+):(.+)\)/, "\x1B[3m\x1B[2m")?.concat("\x1B[0m");
  throw error;
}
function warn(message) {
  globalThis.console.log(`\x1B[38;5;11mil2cpp\x1B[0m: ${message}`);
}
function inform(message) {
  globalThis.console.log(`\x1B[38;5;12mil2cpp\x1B[0m: ${message}`);
}
function decorate(target, decorator, descriptors = Object.getOwnPropertyDescriptors(target)) {
  for (const key in descriptors) {
    descriptors[key] = decorator(target, key, descriptors[key]);
  }
  Object.defineProperties(target, descriptors);
  return target;
}
function getter(target, key, get, decorator) {
  globalThis.Object.defineProperty(target, key, decorator?.(target, key, { get, configurable: true }) ?? { get, configurable: true });
}
function lazy(_, propertyKey, descriptor) {
  const getter2 = descriptor.get;
  if (!getter2) {
    throw new Error("@lazy can only be applied to getter accessors");
  }
  descriptor.get = function() {
    const value = getter2.call(this);
    Object.defineProperty(this, propertyKey, {
      value,
      configurable: descriptor.configurable,
      enumerable: descriptor.enumerable,
      writable: false
    });
    return value;
  };
  return descriptor;
}
var NativeStruct = class {
  handle;
  constructor(handleOrWrapper) {
    if (handleOrWrapper instanceof NativePointer) {
      this.handle = handleOrWrapper;
    } else {
      this.handle = handleOrWrapper.handle;
    }
  }
  equals(other) {
    return this.handle.equals(other.handle);
  }
  isNull() {
    return this.handle.isNull();
  }
  asNullable() {
    return this.isNull() ? null : this;
  }
};
function addFlippedEntries(obj) {
  return Object.keys(obj).reduce((obj2, key) => (obj2[obj2[key]] = key, obj2), obj);
}
NativePointer.prototype.offsetOf = function(condition, depth) {
  depth ??= 512;
  for (let i = 0; depth > 0 ? i < depth : i < -depth; i++) {
    if (condition(depth > 0 ? this.add(i) : this.sub(i))) {
      return i;
    }
  }
  return null;
};
function readNativeIterator(block) {
  const array = [];
  const iterator = Memory.alloc(Process.pointerSize);
  let handle = block(iterator);
  while (!handle.isNull()) {
    array.push(handle);
    handle = block(iterator);
  }
  return array;
}
function readNativeList(block) {
  const lengthPointer = Memory.alloc(Process.pointerSize);
  const startPointer = block(lengthPointer);
  if (startPointer.isNull()) {
    return [];
  }
  const array = new Array(lengthPointer.readInt());
  for (let i = 0; i < array.length; i++) {
    array[i] = startPointer.add(i * Process.pointerSize).readPointer();
  }
  return array;
}
function recycle(Class) {
  return new Proxy(Class, {
    cache: /* @__PURE__ */ new Map(),
    construct(Target, argArray) {
      const handle = argArray[0].toUInt32();
      if (!this.cache.has(handle)) {
        this.cache.set(handle, new Target(argArray[0]));
      }
      return this.cache.get(handle);
    }
  });
}
var UnityVersion;
(function(UnityVersion2) {
  const pattern = /(6\d{3}|20\d{2}|\d)\.(\d)\.(\d{1,2})(?:[abcfp]|rc){0,2}\d?/;
  function find(string) {
    return string?.match(pattern)?.[0];
  }
  UnityVersion2.find = find;
  function gte(a, b) {
    return compare(a, b) >= 0;
  }
  UnityVersion2.gte = gte;
  function lt(a, b) {
    return compare(a, b) < 0;
  }
  UnityVersion2.lt = lt;
  function compare(a, b) {
    const aMatches = a.match(pattern);
    const bMatches = b.match(pattern);
    for (let i = 1; i <= 3; i++) {
      const a2 = Number(aMatches?.[i] ?? -1);
      const b2 = Number(bMatches?.[i] ?? -1);
      if (a2 > b2)
        return 1;
      else if (a2 < b2)
        return -1;
    }
    return 0;
  }
})(UnityVersion || (UnityVersion = {}));
var Il2Cpp2;
(function(Il2Cpp3) {
  function alloc(size = Process.pointerSize) {
    return Il2Cpp3.exports.alloc(size);
  }
  Il2Cpp3.alloc = alloc;
  function free(pointer) {
    return Il2Cpp3.exports.free(pointer);
  }
  Il2Cpp3.free = free;
  function read(pointer, type) {
    switch (type.enumValue) {
      case Il2Cpp3.Type.Enum.BOOLEAN:
        return !!pointer.readS8();
      case Il2Cpp3.Type.Enum.BYTE:
        return pointer.readS8();
      case Il2Cpp3.Type.Enum.UBYTE:
        return pointer.readU8();
      case Il2Cpp3.Type.Enum.SHORT:
        return pointer.readS16();
      case Il2Cpp3.Type.Enum.USHORT:
        return pointer.readU16();
      case Il2Cpp3.Type.Enum.INT:
        return pointer.readS32();
      case Il2Cpp3.Type.Enum.UINT:
        return pointer.readU32();
      case Il2Cpp3.Type.Enum.CHAR:
        return pointer.readU16();
      case Il2Cpp3.Type.Enum.LONG:
        return pointer.readS64();
      case Il2Cpp3.Type.Enum.ULONG:
        return pointer.readU64();
      case Il2Cpp3.Type.Enum.FLOAT:
        return pointer.readFloat();
      case Il2Cpp3.Type.Enum.DOUBLE:
        return pointer.readDouble();
      case Il2Cpp3.Type.Enum.NINT:
      case Il2Cpp3.Type.Enum.NUINT:
        return pointer.readPointer();
      case Il2Cpp3.Type.Enum.POINTER:
        return new Il2Cpp3.Pointer(pointer.readPointer(), type.class.baseType);
      case Il2Cpp3.Type.Enum.VALUE_TYPE:
        return new Il2Cpp3.ValueType(pointer, type);
      case Il2Cpp3.Type.Enum.OBJECT:
      case Il2Cpp3.Type.Enum.CLASS:
        return new Il2Cpp3.Object(pointer.readPointer());
      case Il2Cpp3.Type.Enum.GENERIC_INSTANCE:
        return type.class.isValueType ? new Il2Cpp3.ValueType(pointer, type) : new Il2Cpp3.Object(pointer.readPointer());
      case Il2Cpp3.Type.Enum.STRING:
        return new Il2Cpp3.String(pointer.readPointer());
      case Il2Cpp3.Type.Enum.ARRAY:
      case Il2Cpp3.Type.Enum.NARRAY:
        return new Il2Cpp3.Array(pointer.readPointer());
    }
    raise(`couldn't read the value from ${pointer} using an unhandled or unknown type ${type.name} (${type.enumValue}), please file an issue`);
  }
  Il2Cpp3.read = read;
  function write(pointer, value, type) {
    switch (type.enumValue) {
      case Il2Cpp3.Type.Enum.BOOLEAN:
        return pointer.writeS8(+value);
      case Il2Cpp3.Type.Enum.BYTE:
        return pointer.writeS8(value);
      case Il2Cpp3.Type.Enum.UBYTE:
        return pointer.writeU8(value);
      case Il2Cpp3.Type.Enum.SHORT:
        return pointer.writeS16(value);
      case Il2Cpp3.Type.Enum.USHORT:
        return pointer.writeU16(value);
      case Il2Cpp3.Type.Enum.INT:
        return pointer.writeS32(value);
      case Il2Cpp3.Type.Enum.UINT:
        return pointer.writeU32(value);
      case Il2Cpp3.Type.Enum.CHAR:
        return pointer.writeU16(value);
      case Il2Cpp3.Type.Enum.LONG:
        return pointer.writeS64(value);
      case Il2Cpp3.Type.Enum.ULONG:
        return pointer.writeU64(value);
      case Il2Cpp3.Type.Enum.FLOAT:
        return pointer.writeFloat(value);
      case Il2Cpp3.Type.Enum.DOUBLE:
        return pointer.writeDouble(value);
      case Il2Cpp3.Type.Enum.NINT:
      case Il2Cpp3.Type.Enum.NUINT:
      case Il2Cpp3.Type.Enum.POINTER:
      case Il2Cpp3.Type.Enum.STRING:
      case Il2Cpp3.Type.Enum.ARRAY:
      case Il2Cpp3.Type.Enum.NARRAY:
        return pointer.writePointer(value);
      case Il2Cpp3.Type.Enum.VALUE_TYPE:
        return Memory.copy(pointer, value, type.class.valueTypeSize), pointer;
      case Il2Cpp3.Type.Enum.OBJECT:
      case Il2Cpp3.Type.Enum.CLASS:
      case Il2Cpp3.Type.Enum.GENERIC_INSTANCE:
        return value instanceof Il2Cpp3.ValueType ? (Memory.copy(pointer, value, type.class.valueTypeSize), pointer) : pointer.writePointer(value);
    }
    raise(`couldn't write value ${value} to ${pointer} using an unhandled or unknown type ${type.name} (${type.enumValue}), please file an issue`);
  }
  Il2Cpp3.write = write;
  function fromFridaValue(value, type) {
    if (globalThis.Array.isArray(value)) {
      const handle = Memory.alloc(type.class.valueTypeSize);
      const fields = type.class.fields.filter((_) => !_.isStatic);
      for (let i = 0; i < fields.length; i++) {
        const convertedValue = fromFridaValue(value[i], fields[i].type);
        write(handle.add(fields[i].offset).sub(Il2Cpp3.Object.headerSize), convertedValue, fields[i].type);
      }
      return new Il2Cpp3.ValueType(handle, type);
    } else if (value instanceof NativePointer) {
      if (type.isByReference) {
        return new Il2Cpp3.Reference(value, type);
      }
      switch (type.enumValue) {
        case Il2Cpp3.Type.Enum.POINTER:
          return new Il2Cpp3.Pointer(value, type.class.baseType);
        case Il2Cpp3.Type.Enum.STRING:
          return new Il2Cpp3.String(value);
        case Il2Cpp3.Type.Enum.CLASS:
        case Il2Cpp3.Type.Enum.GENERIC_INSTANCE:
        case Il2Cpp3.Type.Enum.OBJECT:
          return new Il2Cpp3.Object(value);
        case Il2Cpp3.Type.Enum.ARRAY:
        case Il2Cpp3.Type.Enum.NARRAY:
          return new Il2Cpp3.Array(value);
        default:
          return value;
      }
    } else if (type.enumValue == Il2Cpp3.Type.Enum.BOOLEAN) {
      return !!value;
    } else if (type.enumValue == Il2Cpp3.Type.Enum.VALUE_TYPE && type.class.isEnum) {
      return fromFridaValue([value], type);
    } else {
      return value;
    }
  }
  Il2Cpp3.fromFridaValue = fromFridaValue;
  function toFridaValue(value) {
    if (typeof value == "boolean") {
      return +value;
    } else if (value instanceof Il2Cpp3.ValueType) {
      if (value.type.class.isEnum) {
        return value.field("value__").value;
      } else {
        const _ = value.type.class.fields.filter((_2) => !_2.isStatic).map((_2) => toFridaValue(_2.bind(value).value));
        return _.length == 0 ? [0] : _;
      }
    } else {
      return value;
    }
  }
  Il2Cpp3.toFridaValue = toFridaValue;
})(Il2Cpp2 || (Il2Cpp2 = {}));
var Il2Cpp2;
(function(Il2Cpp3) {
  getter(Il2Cpp3, "module", () => {
    return tryModule() ?? raise("Could not find IL2CPP module");
  });
  async function initialize(blocking = false) {
    const module = tryModule() ?? await new Promise((resolve) => {
      const [moduleName, fallbackModuleName] = getExpectedModuleNames();
      const timeout = setTimeout(() => {
        warn(`after 10 seconds, IL2CPP module '${moduleName}' has not been loaded yet, is the app running?`);
      }, 1e4);
      const moduleObserver = Process.attachModuleObserver({
        onAdded(module2) {
          if (module2.name == moduleName || fallbackModuleName && module2.name == fallbackModuleName) {
            clearTimeout(timeout);
            setImmediate(() => {
              resolve(module2);
              moduleObserver.detach();
            });
          }
        }
      });
    });
    Reflect.defineProperty(Il2Cpp3, "module", { value: module });
    if (Il2Cpp3.exports.getCorlib().isNull()) {
      return await new Promise((resolve) => {
        const timeout = setTimeout(() => {
          if (!Il2Cpp3.exports.getCorlib().isNull()) {
            warn(`resuming execution despite IL2CPP initialization not being captured in time, please open an issue as this is suboptimal`);
            interceptor.detach();
            resolve(false);
          }
        }, 1e3);
        const interceptor = Interceptor.attach(Il2Cpp3.exports.initialize, {
          onEnter() {
            clearTimeout(timeout);
          },
          onLeave() {
            interceptor.detach();
            blocking ? resolve(true) : setImmediate(() => resolve(false));
          }
        });
      });
    }
    return false;
  }
  Il2Cpp3.initialize = initialize;
  function tryModule() {
    const [moduleName, fallback] = getExpectedModuleNames();
    return Process.findModuleByName(moduleName) ?? Process.findModuleByName(fallback ?? moduleName) ?? (Process.platform == "darwin" ? Process.findModuleByAddress(DebugSymbol.fromName("il2cpp_init").address) : void 0) ?? void 0;
  }
  function getExpectedModuleNames() {
    if (Il2Cpp3.$config.moduleName) {
      return [Il2Cpp3.$config.moduleName];
    }
    switch (Process.platform) {
      case "linux":
        return [Android.apiLevel ? "libil2cpp.so" : "GameAssembly.so"];
      case "windows":
        return ["GameAssembly.dll"];
      case "darwin":
        return ["UnityFramework", "GameAssembly.dylib"];
    }
    raise(`${Process.platform} is not supported yet`);
  }
})(Il2Cpp2 || (Il2Cpp2 = {}));
var Il2Cpp2;
(function(Il2Cpp3) {
  function nullable(valueOrNull, klass) {
    const actualClass = typeof valueOrNull == "boolean" ? Il2Cpp3.corlib.class("System.Boolean") : typeof valueOrNull == "number" ? klass ?? Il2Cpp3.corlib.class("System.Int32") : valueOrNull instanceof Int64 ? Il2Cpp3.corlib.class("System.Int64") : valueOrNull instanceof UInt64 ? Il2Cpp3.corlib.class("System.UInt64") : valueOrNull instanceof NativePointer ? klass ?? Il2Cpp3.corlib.class("System.IntPtr") : valueOrNull instanceof Il2Cpp3.ValueType ? valueOrNull.type.class : klass ?? raise(`A class must be specified when constructing a nullable for value '${valueOrNull}'`);
    if (actualClass.isValueType == false) {
      raise(`Cannot create nullable value type out of a reference type '${actualClass.type.name}'`);
    }
    const inflatedClass = Il2Cpp3.corlib.class("System.Nullable`1").inflate(actualClass);
    const struct = new Il2Cpp3.ValueType(Memory.alloc(inflatedClass.valueTypeSize), inflatedClass.type);
    (struct.tryField("hasValue") ?? struct.field("has_value")).value = valueOrNull != null;
    if (valueOrNull != null) {
      struct.field("value").value = valueOrNull;
    }
    return struct;
  }
  Il2Cpp3.nullable = nullable;
})(Il2Cpp2 || (Il2Cpp2 = {}));
var Il2Cpp2;
(function(Il2Cpp3) {
  async function perform(block, flag = "bind") {
    let attachedThread = null;
    try {
      const isInMainThread = await Il2Cpp3.initialize(flag == "main");
      if (flag == "main" && !isInMainThread) {
        return perform(() => Il2Cpp3.mainThread.schedule(block), "free");
      }
      if (Il2Cpp3.currentThread == null) {
        attachedThread = Il2Cpp3.domain.attach();
      }
      if (flag == "bind" && attachedThread != null) {
        Script.bindWeak(globalThis, () => attachedThread?.detach());
      }
      const result = block();
      return result instanceof Promise ? await result : result;
    } catch (error) {
      Script.nextTick((_) => {
        throw _;
      }, error);
      return Promise.reject(error);
    } finally {
      if (flag == "free" && attachedThread != null) {
        attachedThread.detach();
      }
    }
  }
  Il2Cpp3.perform = perform;
})(Il2Cpp2 || (Il2Cpp2 = {}));
var Il2Cpp2;
(function(Il2Cpp3) {
  class Tracer {
    /** @internal */
    #state = {
      depth: 0,
      buffer: [],
      history: /* @__PURE__ */ new Set(),
      flush: () => {
        if (this.#state.depth == 0) {
          const message = `
${this.#state.buffer.join("\n")}
`;
          if (this.#verbose) {
            inform(message);
          } else {
            const hash = Checksum.compute("md5", message);
            if (!this.#state.history.has(hash)) {
              this.#state.history.add(hash);
              inform(message);
            }
          }
          this.#state.buffer.length = 0;
        }
      }
    };
    /** @internal */
    #threadId = Il2Cpp3.mainThread.id;
    /** @internal */
    #verbose = false;
    /** @internal */
    #applier;
    /** @internal */
    #targets = [];
    /** @internal */
    #domain;
    /** @internal */
    #assemblies;
    /** @internal */
    #classes;
    /** @internal */
    #methods;
    /** @internal */
    #assemblyFilter;
    /** @internal */
    #classFilter;
    /** @internal */
    #methodFilter;
    /** @internal */
    #parameterFilter;
    constructor(applier) {
      this.#applier = applier;
    }
    /** */
    thread(thread) {
      this.#threadId = thread.id;
      return this;
    }
    /** Determines whether print duplicate logs. */
    verbose(value) {
      this.#verbose = value;
      return this;
    }
    /** Sets the application domain as the place where to find the target methods. */
    domain() {
      this.#domain = Il2Cpp3.domain;
      return this;
    }
    /** Sets the passed `assemblies` as the place where to find the target methods. */
    assemblies(...assemblies) {
      this.#assemblies = assemblies;
      return this;
    }
    /** Sets the passed `classes` as the place where to find the target methods. */
    classes(...classes) {
      this.#classes = classes;
      return this;
    }
    /** Sets the passed `methods` as the target methods. */
    methods(...methods) {
      this.#methods = methods;
      return this;
    }
    /** Filters the assemblies where to find the target methods. */
    filterAssemblies(filter2) {
      this.#assemblyFilter = filter2;
      return this;
    }
    /** Filters the classes where to find the target methods. */
    filterClasses(filter2) {
      this.#classFilter = filter2;
      return this;
    }
    /** Filters the target methods. */
    filterMethods(filter2) {
      this.#methodFilter = filter2;
      return this;
    }
    /** Filters the target methods. */
    filterParameters(filter2) {
      this.#parameterFilter = filter2;
      return this;
    }
    /** Commits the current changes by finding the target methods. */
    and() {
      const filterMethod = (method) => {
        if (this.#parameterFilter == void 0) {
          this.#targets.push(method);
          return;
        }
        for (const parameter of method.parameters) {
          if (this.#parameterFilter(parameter)) {
            this.#targets.push(method);
            break;
          }
        }
      };
      const filterMethods = (values) => {
        for (const method of values) {
          filterMethod(method);
        }
      };
      const filterClass = (klass) => {
        if (this.#methodFilter == void 0) {
          filterMethods(klass.methods);
          return;
        }
        for (const method of klass.methods) {
          if (this.#methodFilter(method)) {
            filterMethod(method);
          }
        }
      };
      const filterClasses = (values) => {
        for (const klass of values) {
          filterClass(klass);
        }
      };
      const filterAssembly = (assembly) => {
        if (this.#classFilter == void 0) {
          filterClasses(assembly.image.classes);
          return;
        }
        for (const klass of assembly.image.classes) {
          if (this.#classFilter(klass)) {
            filterClass(klass);
          }
        }
      };
      const filterAssemblies = (assemblies) => {
        for (const assembly of assemblies) {
          filterAssembly(assembly);
        }
      };
      const filterDomain = (domain) => {
        if (this.#assemblyFilter == void 0) {
          filterAssemblies(domain.assemblies);
          return;
        }
        for (const assembly of domain.assemblies) {
          if (this.#assemblyFilter(assembly)) {
            filterAssembly(assembly);
          }
        }
      };
      this.#methods ? filterMethods(this.#methods) : this.#classes ? filterClasses(this.#classes) : this.#assemblies ? filterAssemblies(this.#assemblies) : this.#domain ? filterDomain(this.#domain) : void 0;
      this.#assemblies = void 0;
      this.#classes = void 0;
      this.#methods = void 0;
      this.#assemblyFilter = void 0;
      this.#classFilter = void 0;
      this.#methodFilter = void 0;
      this.#parameterFilter = void 0;
      return this;
    }
    /** Starts tracing. */
    attach() {
      for (const target of this.#targets) {
        if (!target.virtualAddress.isNull()) {
          try {
            this.#applier(target, this.#state, this.#threadId);
          } catch (e) {
            switch (e.message) {
              case /unable to intercept function at \w+; please file a bug/.exec(e.message)?.input:
              case "already replaced this function":
                break;
              default:
                throw e;
            }
          }
        }
      }
    }
  }
  Il2Cpp3.Tracer = Tracer;
  function trace(parameters = false) {
    const applier = () => (method, state, threadId) => {
      const paddedVirtualAddress = method.relativeVirtualAddress.toString(16).padStart(8, "0");
      Interceptor.attach(method.virtualAddress, {
        onEnter() {
          if (this.threadId == threadId) {
            state.buffer.push(`\x1B[2m0x${paddedVirtualAddress}\x1B[0m ${`\u2502 `.repeat(state.depth++)}\u250C\u2500\x1B[35m${method.class.type.name}::\x1B[1m${method.name}\x1B[0m\x1B[0m`);
          }
        },
        onLeave() {
          if (this.threadId == threadId) {
            state.buffer.push(`\x1B[2m0x${paddedVirtualAddress}\x1B[0m ${`\u2502 `.repeat(--state.depth)}\u2514\u2500\x1B[33m${method.class.type.name}::\x1B[1m${method.name}\x1B[0m\x1B[0m`);
            state.flush();
          }
        }
      });
    };
    const applierWithParameters = () => (method, state, threadId) => {
      const paddedVirtualAddress = method.relativeVirtualAddress.toString(16).padStart(8, "0");
      const parameterStartIndex = +method.nativeSignatureHasInstanceSlot;
      const callback = function(...args) {
        if (this.threadId == threadId) {
          const thisParameter = method.isStatic ? void 0 : new Il2Cpp3.Parameter("this", -1, method.class.type);
          const parameters2 = thisParameter ? [thisParameter].concat(method.parameters) : method.parameters;
          state.buffer.push(`\x1B[2m0x${paddedVirtualAddress}\x1B[0m ${`\u2502 `.repeat(state.depth++)}\u250C\u2500\x1B[35m${method.class.type.name}::\x1B[1m${method.name}\x1B[0m\x1B[0m(${parameters2.map((e) => `\x1B[32m${e.name}\x1B[0m = \x1B[31m${Il2Cpp3.fromFridaValue(args[e.position + parameterStartIndex], e.type)}\x1B[0m`).join(", ")})`);
        }
        const returnValue = method.nativeFunction(...args);
        if (this.threadId == threadId) {
          state.buffer.push(`\x1B[2m0x${paddedVirtualAddress}\x1B[0m ${`\u2502 `.repeat(--state.depth)}\u2514\u2500\x1B[33m${method.class.type.name}::\x1B[1m${method.name}\x1B[0m\x1B[0m${returnValue == void 0 ? "" : ` = \x1B[36m${Il2Cpp3.fromFridaValue(returnValue, method.returnType)}`}\x1B[0m`);
          state.flush();
        }
        return returnValue;
      };
      method.revert();
      const nativeCallback = new NativeCallback(callback, method.returnType.fridaAlias, method.fridaSignature);
      Interceptor.replace(method.virtualAddress, nativeCallback);
    };
    return new Il2Cpp3.Tracer(parameters ? applierWithParameters() : applier());
  }
  Il2Cpp3.trace = trace;
  function backtrace(mode) {
    const methods = Il2Cpp3.domain.assemblies.flatMap((_) => _.image.classes.flatMap((_2) => _2.methods.filter((_3) => !_3.virtualAddress.isNull()))).sort((_, __) => _.virtualAddress.compare(__.virtualAddress));
    const searchInsert = (target) => {
      let left = 0;
      let right = methods.length - 1;
      while (left <= right) {
        const pivot = Math.floor((left + right) / 2);
        const comparison = methods[pivot].virtualAddress.compare(target);
        if (comparison == 0) {
          return methods[pivot];
        } else if (comparison > 0) {
          right = pivot - 1;
        } else {
          left = pivot + 1;
        }
      }
      return methods[right];
    };
    const applier = () => (method, state, threadId) => {
      Interceptor.attach(method.virtualAddress, function() {
        if (this.threadId == threadId) {
          const handles = globalThis.Thread.backtrace(this.context, mode);
          handles.unshift(method.virtualAddress);
          for (const handle of handles) {
            if (handle.compare(Il2Cpp3.module.base) > 0 && handle.compare(Il2Cpp3.module.base.add(Il2Cpp3.module.size)) < 0) {
              const method2 = searchInsert(handle);
              if (method2) {
                const offset = handle.sub(method2.virtualAddress);
                if (offset.compare(4095) < 0) {
                  state.buffer.push(`\x1B[2m0x${method2.relativeVirtualAddress.toString(16).padStart(8, "0")}\x1B[0m\x1B[2m+0x${offset.toString(16).padStart(3, `0`)}\x1B[0m ${method2.class.type.name}::\x1B[1m${method2.name}\x1B[0m`);
                }
              }
            }
          }
          state.flush();
        }
      });
    };
    return new Il2Cpp3.Tracer(applier());
  }
  Il2Cpp3.backtrace = backtrace;
})(Il2Cpp2 || (Il2Cpp2 = {}));
var Il2Cpp2;
(function(Il2Cpp3) {
  class Array2 extends NativeStruct {
    /** Gets the Il2CppArray struct size, possibly equal to `Process.pointerSize * 4`. */
    static get headerSize() {
      return Il2Cpp3.corlib.class("System.Array").instanceSize;
    }
    /** @internal Gets a pointer to the first element of the current array. */
    get elements() {
      const array2 = Il2Cpp3.string("vfsfitvnm").object.method("ToCharArray", 0).invoke();
      const offset = Memory.scanSync(array2.handle, 255, "76 00 66 00 73 00 66 00 69 00 74 00 76 00 6e 00 6d 00")[0]?.address?.sub(array2.handle) ?? raise("couldn't find the elements offset in the native array struct");
      getter(Il2Cpp3.Array.prototype, "elements", function() {
        return new Il2Cpp3.Pointer(this.handle.add(offset), this.elementType);
      }, lazy);
      return this.elements;
    }
    /** Gets the size of the object encompassed by the current array. */
    get elementSize() {
      return this.elementType.class.arrayElementSize;
    }
    /** Gets the type of the object encompassed by the current array. */
    get elementType() {
      return this.object.class.type.class.baseType;
    }
    /** Gets the total number of elements in all the dimensions of the current array. */
    get length() {
      return Il2Cpp3.exports.arrayGetLength(this);
    }
    /** Gets the encompassing object of the current array. */
    get object() {
      return new Il2Cpp3.Object(this);
    }
    /** Gets the element at the specified index of the current array. */
    get(index) {
      if (index < 0 || index >= this.length) {
        raise(`cannot get element at index ${index} as the array length is ${this.length}`);
      }
      return this.elements.get(index);
    }
    /** Sets the element at the specified index of the current array. */
    set(index, value) {
      if (index < 0 || index >= this.length) {
        raise(`cannot set element at index ${index} as the array length is ${this.length}`);
      }
      this.elements.set(index, value);
    }
    /** */
    toString() {
      return this.isNull() ? "null" : `[${this.elements.read(this.length, 0)}]`;
    }
    /** Iterable. */
    *[Symbol.iterator]() {
      for (let i = 0; i < this.length; i++) {
        yield this.elements.get(i);
      }
    }
  }
  __decorate([
    lazy
  ], Array2.prototype, "elementSize", null);
  __decorate([
    lazy
  ], Array2.prototype, "elementType", null);
  __decorate([
    lazy
  ], Array2.prototype, "length", null);
  __decorate([
    lazy
  ], Array2.prototype, "object", null);
  __decorate([
    lazy
  ], Array2, "headerSize", null);
  Il2Cpp3.Array = Array2;
  function array(klass, lengthOrElements) {
    const length2 = typeof lengthOrElements == "number" ? lengthOrElements : lengthOrElements.length;
    const array2 = new Il2Cpp3.Array(Il2Cpp3.exports.arrayNew(klass, length2));
    if (globalThis.Array.isArray(lengthOrElements)) {
      array2.elements.write(lengthOrElements);
    }
    return array2;
  }
  Il2Cpp3.array = array;
})(Il2Cpp2 || (Il2Cpp2 = {}));
var Il2Cpp2;
(function(Il2Cpp3) {
  let Assembly = class Assembly extends NativeStruct {
    /** Gets the image of this assembly. */
    get image() {
      if (Il2Cpp3.exports.assemblyGetImage.isNull()) {
        const runtimeModule = this.object.tryMethod("GetType", 1)?.invoke(Il2Cpp3.string("<Module>"))?.asNullable()?.tryMethod("get_Module")?.invoke() ?? this.object.tryMethod("GetModules", 1)?.invoke(false)?.get(0) ?? raise(`couldn't find the runtime module object of assembly ${this.name}`);
        return new Il2Cpp3.Image(runtimeModule.field("_impl").value);
      }
      return new Il2Cpp3.Image(Il2Cpp3.exports.assemblyGetImage(this));
    }
    /** Gets the name of this assembly. */
    get name() {
      return this.image.name.replace(".dll", "");
    }
    /** Gets the encompassing object of the current assembly. */
    get object() {
      for (const _ of Il2Cpp3.domain.object.method("GetAssemblies", 1).invoke(false)) {
        if (_.field("_mono_assembly").value.equals(this)) {
          return _;
        }
      }
      raise("couldn't find the object of the native assembly struct");
    }
  };
  __decorate([
    lazy
  ], Assembly.prototype, "name", null);
  __decorate([
    lazy
  ], Assembly.prototype, "object", null);
  Assembly = __decorate([
    recycle
  ], Assembly);
  Il2Cpp3.Assembly = Assembly;
})(Il2Cpp2 || (Il2Cpp2 = {}));
var Il2Cpp2;
(function(Il2Cpp3) {
  let Class = class Class extends NativeStruct {
    /** Gets the actual size of the instance of the current class. */
    get actualInstanceSize() {
      const SystemString = Il2Cpp3.corlib.class("System.String");
      const offset = SystemString.handle.offsetOf((_) => _.readInt() == SystemString.instanceSize - 2) ?? raise("couldn't find the actual instance size offset in the native class struct");
      getter(Il2Cpp3.Class.prototype, "actualInstanceSize", function() {
        return this.handle.add(offset).readS32();
      }, lazy);
      return this.actualInstanceSize;
    }
    /** Gets the array class which encompass the current class. */
    get arrayClass() {
      return new Il2Cpp3.Class(Il2Cpp3.exports.classGetArrayClass(this, 1));
    }
    /** Gets the size of the object encompassed by the current array class. */
    get arrayElementSize() {
      return Il2Cpp3.exports.classGetArrayElementSize(this);
    }
    /** Gets the name of the assembly in which the current class is defined. */
    get assemblyName() {
      return Il2Cpp3.exports.classGetAssemblyName(this).readUtf8String().replace(".dll", "");
    }
    /** Gets the class that declares the current nested class. */
    get declaringClass() {
      return new Il2Cpp3.Class(Il2Cpp3.exports.classGetDeclaringType(this)).asNullable();
    }
    /** Gets the encompassed type of this array, reference, pointer or enum type. */
    get baseType() {
      return new Il2Cpp3.Type(Il2Cpp3.exports.classGetBaseType(this)).asNullable();
    }
    /** Gets the class of the object encompassed or referred to by the current array, pointer or reference class. */
    get elementClass() {
      return new Il2Cpp3.Class(Il2Cpp3.exports.classGetElementClass(this)).asNullable();
    }
    /** Gets the fields of the current class. */
    get fields() {
      return readNativeIterator((_) => Il2Cpp3.exports.classGetFields(this, _)).map((_) => new Il2Cpp3.Field(_));
    }
    /** Gets the flags of the current class. */
    get flags() {
      return Il2Cpp3.exports.classGetFlags(this);
    }
    /** Gets the full name (namespace + name) of the current class. */
    get fullName() {
      return this.namespace ? `${this.namespace}.${this.name}` : this.name;
    }
    /** Gets the generic class of the current class if the current class is inflated. */
    get genericClass() {
      const klass = this.image.tryClass(this.fullName)?.asNullable();
      return klass?.equals(this) ? null : klass ?? null;
    }
    /** Gets the generics parameters of this generic class. */
    get generics() {
      if (!this.isGeneric && !this.isInflated) {
        return [];
      }
      const types = this.type.object.method("GetGenericArguments").invoke();
      return globalThis.Array.from(types).map((_) => new Il2Cpp3.Class(Il2Cpp3.exports.classFromObject(_)));
    }
    /** Determines whether the GC has tracking references to the current class instances. */
    get hasReferences() {
      return !!Il2Cpp3.exports.classHasReferences(this);
    }
    /** Determines whether ther current class has a valid static constructor. */
    get hasStaticConstructor() {
      const staticConstructor = this.tryMethod(".cctor");
      return staticConstructor != null && !staticConstructor.virtualAddress.isNull();
    }
    /** Gets the image in which the current class is defined. */
    get image() {
      return new Il2Cpp3.Image(Il2Cpp3.exports.classGetImage(this));
    }
    /** Gets the size of the instance of the current class. */
    get instanceSize() {
      return Il2Cpp3.exports.classGetInstanceSize(this);
    }
    /** Determines whether the current class is abstract. */
    get isAbstract() {
      return !!Il2Cpp3.exports.classIsAbstract(this);
    }
    /** Determines whether the current class is blittable. */
    get isBlittable() {
      return !!Il2Cpp3.exports.classIsBlittable(this);
    }
    /** Determines whether the current class is an enumeration. */
    get isEnum() {
      return !!Il2Cpp3.exports.classIsEnum(this);
    }
    /** Determines whether the current class is a generic one. */
    get isGeneric() {
      return !!Il2Cpp3.exports.classIsGeneric(this);
    }
    /** Determines whether the current class is inflated. */
    get isInflated() {
      return !!Il2Cpp3.exports.classIsInflated(this);
    }
    /** Determines whether the current class is an interface. */
    get isInterface() {
      return !!Il2Cpp3.exports.classIsInterface(this);
    }
    /** Determines whether the current class is a struct. */
    get isStruct() {
      return this.isValueType && !this.isEnum;
    }
    /** Determines whether the current class is a value type. */
    get isValueType() {
      return !!Il2Cpp3.exports.classIsValueType(this);
    }
    /** Gets the interfaces implemented or inherited by the current class. */
    get interfaces() {
      return readNativeIterator((_) => Il2Cpp3.exports.classGetInterfaces(this, _)).map((_) => new Il2Cpp3.Class(_));
    }
    /** Gets the methods implemented by the current class. */
    get methods() {
      return readNativeIterator((_) => Il2Cpp3.exports.classGetMethods(this, _)).map((_) => new Il2Cpp3.Method(_));
    }
    /** Gets the name of the current class. */
    get name() {
      return Il2Cpp3.exports.classGetName(this).readUtf8String();
    }
    /** Gets the namespace of the current class. */
    get namespace() {
      return Il2Cpp3.exports.classGetNamespace(this).readUtf8String() || void 0;
    }
    /** Gets the classes nested inside the current class. */
    get nestedClasses() {
      return readNativeIterator((_) => Il2Cpp3.exports.classGetNestedClasses(this, _)).map((_) => new Il2Cpp3.Class(_));
    }
    /** Gets the class from which the current class directly inherits. */
    get parent() {
      return new Il2Cpp3.Class(Il2Cpp3.exports.classGetParent(this)).asNullable();
    }
    /** Gets the pointer class of the current class. */
    get pointerClass() {
      return new Il2Cpp3.Class(Il2Cpp3.exports.classFromObject(this.type.object.method("MakePointerType").invoke()));
    }
    /** Gets the rank (number of dimensions) of the current array class. */
    get rank() {
      let rank = 0;
      const name = this.name;
      for (let i = this.name.length - 1; i > 0; i--) {
        const c = name[i];
        if (c == "]")
          rank++;
        else if (c == "[" || rank == 0)
          break;
        else if (c == ",")
          rank++;
        else
          break;
      }
      return rank;
    }
    /** Gets a pointer to the static fields of the current class. */
    get staticFieldsData() {
      return Il2Cpp3.exports.classGetStaticFieldData(this);
    }
    /** Gets the size of the instance - as a value type - of the current class. */
    get valueTypeSize() {
      return Il2Cpp3.exports.classGetValueTypeSize(this, NULL);
    }
    /** Gets the type of the current class. */
    get type() {
      return new Il2Cpp3.Type(Il2Cpp3.exports.classGetType(this));
    }
    /** Allocates a new object of the current class. */
    alloc() {
      return new Il2Cpp3.Object(Il2Cpp3.exports.objectNew(this));
    }
    /** Gets the field identified by the given name. */
    field(name) {
      return this.tryField(name) ?? raise(`couldn't find field ${name} in class ${this.type.name}`);
    }
    /** Gets the hierarchy of the current class. */
    *hierarchy(options) {
      let klass = options?.includeCurrent ?? true ? this : this.parent;
      while (klass) {
        yield klass;
        klass = klass.parent;
      }
    }
    /** Builds a generic instance of the current generic class. */
    inflate(...classes) {
      if (!this.isGeneric) {
        raise(`cannot inflate class ${this.type.name} as it has no generic parameters`);
      }
      if (this.generics.length != classes.length) {
        raise(`cannot inflate class ${this.type.name} as it needs ${this.generics.length} generic parameter(s), not ${classes.length}`);
      }
      const types = classes.map((_) => _.type.object);
      const typeArray = Il2Cpp3.array(Il2Cpp3.corlib.class("System.Type"), types);
      const inflatedType = this.type.object.method("MakeGenericType", 1).invoke(typeArray);
      return new Il2Cpp3.Class(Il2Cpp3.exports.classFromObject(inflatedType));
    }
    /** Calls the static constructor of the current class. */
    initialize() {
      Il2Cpp3.exports.classInitialize(this);
      return this;
    }
    /** Determines whether an instance of `other` class can be assigned to a variable of the current type. */
    isAssignableFrom(other) {
      return !!Il2Cpp3.exports.classIsAssignableFrom(this, other);
    }
    /** Determines whether the current class derives from `other` class. */
    isSubclassOf(other, checkInterfaces) {
      return !!Il2Cpp3.exports.classIsSubclassOf(this, other, +checkInterfaces);
    }
    /** Gets the method identified by the given name and parameter count. */
    method(name, parameterCount = -1) {
      return this.tryMethod(name, parameterCount) ?? raise(`couldn't find method ${name} in class ${this.type.name}`);
    }
    /** Gets the nested class with the given name. */
    nested(name) {
      return this.tryNested(name) ?? raise(`couldn't find nested class ${name} in class ${this.type.name}`);
    }
    /** Allocates a new object of the current class and calls its default constructor. */
    new() {
      const object = this.alloc();
      const exceptionArray = Memory.alloc(Process.pointerSize);
      Il2Cpp3.exports.objectInitialize(object, exceptionArray);
      const exception = exceptionArray.readPointer();
      if (!exception.isNull()) {
        raise(new Il2Cpp3.Object(exception).toString());
      }
      return object;
    }
    /** Gets the field with the given name. */
    tryField(name) {
      return new Il2Cpp3.Field(Il2Cpp3.exports.classGetFieldFromName(this, Memory.allocUtf8String(name))).asNullable();
    }
    /** Gets the method with the given name and parameter count. */
    tryMethod(name, parameterCount = -1) {
      return new Il2Cpp3.Method(Il2Cpp3.exports.classGetMethodFromName(this, Memory.allocUtf8String(name), parameterCount)).asNullable();
    }
    /** Gets the nested class with the given name. */
    tryNested(name) {
      return this.nestedClasses.find((_) => _.name == name);
    }
    /** */
    toString() {
      const inherited = [this.parent].concat(this.interfaces);
      return `// ${this.assemblyName}
${this.isEnum ? `enum` : this.isStruct ? `struct` : this.isInterface ? `interface` : `class`} ${this.type.name}${inherited ? ` : ${inherited.map((_) => _?.type.name).join(`, `)}` : ``}
{
    ${this.fields.join(`
    `)}
    ${this.methods.join(`
    `)}
}`;
    }
    /** Executes a callback for every defined class. */
    static enumerate(block) {
      const callback = new NativeCallback((_) => block(new Il2Cpp3.Class(_)), "void", ["pointer", "pointer"]);
      return Il2Cpp3.exports.classForEach(callback, NULL);
    }
  };
  __decorate([
    lazy
  ], Class.prototype, "arrayClass", null);
  __decorate([
    lazy
  ], Class.prototype, "arrayElementSize", null);
  __decorate([
    lazy
  ], Class.prototype, "assemblyName", null);
  __decorate([
    lazy
  ], Class.prototype, "declaringClass", null);
  __decorate([
    lazy
  ], Class.prototype, "baseType", null);
  __decorate([
    lazy
  ], Class.prototype, "elementClass", null);
  __decorate([
    lazy
  ], Class.prototype, "fields", null);
  __decorate([
    lazy
  ], Class.prototype, "flags", null);
  __decorate([
    lazy
  ], Class.prototype, "fullName", null);
  __decorate([
    lazy
  ], Class.prototype, "generics", null);
  __decorate([
    lazy
  ], Class.prototype, "hasReferences", null);
  __decorate([
    lazy
  ], Class.prototype, "hasStaticConstructor", null);
  __decorate([
    lazy
  ], Class.prototype, "image", null);
  __decorate([
    lazy
  ], Class.prototype, "instanceSize", null);
  __decorate([
    lazy
  ], Class.prototype, "isAbstract", null);
  __decorate([
    lazy
  ], Class.prototype, "isBlittable", null);
  __decorate([
    lazy
  ], Class.prototype, "isEnum", null);
  __decorate([
    lazy
  ], Class.prototype, "isGeneric", null);
  __decorate([
    lazy
  ], Class.prototype, "isInflated", null);
  __decorate([
    lazy
  ], Class.prototype, "isInterface", null);
  __decorate([
    lazy
  ], Class.prototype, "isValueType", null);
  __decorate([
    lazy
  ], Class.prototype, "interfaces", null);
  __decorate([
    lazy
  ], Class.prototype, "methods", null);
  __decorate([
    lazy
  ], Class.prototype, "name", null);
  __decorate([
    lazy
  ], Class.prototype, "namespace", null);
  __decorate([
    lazy
  ], Class.prototype, "nestedClasses", null);
  __decorate([
    lazy
  ], Class.prototype, "parent", null);
  __decorate([
    lazy
  ], Class.prototype, "pointerClass", null);
  __decorate([
    lazy
  ], Class.prototype, "rank", null);
  __decorate([
    lazy
  ], Class.prototype, "staticFieldsData", null);
  __decorate([
    lazy
  ], Class.prototype, "valueTypeSize", null);
  __decorate([
    lazy
  ], Class.prototype, "type", null);
  Class = __decorate([
    recycle
  ], Class);
  Il2Cpp3.Class = Class;
})(Il2Cpp2 || (Il2Cpp2 = {}));
var Il2Cpp2;
(function(Il2Cpp3) {
  function delegate(klass, block) {
    const SystemDelegate = Il2Cpp3.corlib.class("System.Delegate");
    const SystemMulticastDelegate = Il2Cpp3.corlib.class("System.MulticastDelegate");
    if (!SystemDelegate.isAssignableFrom(klass)) {
      raise(`cannot create a delegate for ${klass.type.name} as it's a non-delegate class`);
    }
    if (klass.equals(SystemDelegate) || klass.equals(SystemMulticastDelegate)) {
      raise(`cannot create a delegate for neither ${SystemDelegate.type.name} nor ${SystemMulticastDelegate.type.name}, use a subclass instead`);
    }
    const delegate2 = klass.alloc();
    const key = delegate2.handle.toString();
    const Invoke = delegate2.tryMethod("Invoke") ?? raise(`cannot create a delegate for ${klass.type.name}, there is no Invoke method`);
    delegate2.method(".ctor").invoke(delegate2, Invoke.handle);
    const callback = Invoke.wrap(block);
    delegate2.field("method_ptr").value = callback;
    delegate2.field("invoke_impl").value = callback;
    Il2Cpp3._callbacksToKeepAlive[key] = callback;
    return delegate2;
  }
  Il2Cpp3.delegate = delegate;
  Il2Cpp3._callbacksToKeepAlive = {};
})(Il2Cpp2 || (Il2Cpp2 = {}));
var Il2Cpp2;
(function(Il2Cpp3) {
  let Domain = class Domain extends NativeStruct {
    /** Gets the assemblies that have been loaded into the execution context of the application domain. */
    get assemblies() {
      let handles = readNativeList((_) => Il2Cpp3.exports.domainGetAssemblies(this, _));
      if (handles.length == 0) {
        const assemblyObjects = this.object.method("GetAssemblies").overload().invoke();
        handles = globalThis.Array.from(assemblyObjects).map((_) => _.field("_mono_assembly").value);
      }
      return handles.map((_) => new Il2Cpp3.Assembly(_));
    }
    /** Gets the encompassing object of the application domain. */
    get object() {
      return Il2Cpp3.corlib.class("System.AppDomain").method("get_CurrentDomain").invoke();
    }
    /** Opens and loads the assembly with the given name. */
    assembly(name) {
      return this.tryAssembly(name) ?? raise(`couldn't find assembly ${name}`);
    }
    /** Attached a new thread to the application domain. */
    attach() {
      return new Il2Cpp3.Thread(Il2Cpp3.exports.threadAttach(this));
    }
    /** Opens and loads the assembly with the given name. */
    tryAssembly(name) {
      return new Il2Cpp3.Assembly(Il2Cpp3.exports.domainGetAssemblyFromName(this, Memory.allocUtf8String(name))).asNullable();
    }
  };
  __decorate([
    lazy
  ], Domain.prototype, "assemblies", null);
  __decorate([
    lazy
  ], Domain.prototype, "object", null);
  Domain = __decorate([
    recycle
  ], Domain);
  Il2Cpp3.Domain = Domain;
  getter(Il2Cpp3, "domain", () => {
    return new Il2Cpp3.Domain(Il2Cpp3.exports.domainGet());
  }, lazy);
})(Il2Cpp2 || (Il2Cpp2 = {}));
var Il2Cpp2;
(function(Il2Cpp3) {
  class Field extends NativeStruct {
    /** Gets the class in which this field is defined. */
    get class() {
      return new Il2Cpp3.Class(Il2Cpp3.exports.fieldGetClass(this));
    }
    /** Gets the flags of the current field. */
    get flags() {
      return Il2Cpp3.exports.fieldGetFlags(this);
    }
    /** Determines whether this field value is known at compile time. */
    get isLiteral() {
      return (this.flags & 64) != 0;
    }
    /** Determines whether this field is static. */
    get isStatic() {
      return (this.flags & 16) != 0;
    }
    /** Determines whether this field is thread static. */
    get isThreadStatic() {
      const offset = Il2Cpp3.corlib.class("System.AppDomain").field("type_resolve_in_progress").offset;
      getter(Il2Cpp3.Field.prototype, "isThreadStatic", function() {
        return this.offset == offset;
      }, lazy);
      return this.isThreadStatic;
    }
    /** Gets the access modifier of this field. */
    get modifier() {
      switch (this.flags & 7) {
        case 1:
          return "private";
        case 2:
          return "private protected";
        case 3:
          return "internal";
        case 4:
          return "protected";
        case 5:
          return "protected internal";
        case 6:
          return "public";
      }
    }
    /** Gets the name of this field. */
    get name() {
      return Il2Cpp3.exports.fieldGetName(this).readUtf8String();
    }
    /** Gets the offset of this field, calculated as the difference with its owner virtual address. */
    get offset() {
      return Il2Cpp3.exports.fieldGetOffset(this);
    }
    /** Gets the type of this field. */
    get type() {
      return new Il2Cpp3.Type(Il2Cpp3.exports.fieldGetType(this));
    }
    /** Gets the value of this field. */
    get value() {
      if (!this.isStatic) {
        raise(`cannot access instance field ${this.class.type.name}::${this.name} from a class, use an object instead`);
      }
      const handle = Memory.alloc(Process.pointerSize);
      Il2Cpp3.exports.fieldGetStaticValue(this.handle, handle);
      return Il2Cpp3.read(handle, this.type);
    }
    /** Sets the value of this field. Thread static or literal values cannot be altered yet. */
    set value(value) {
      if (!this.isStatic) {
        raise(`cannot access instance field ${this.class.type.name}::${this.name} from a class, use an object instead`);
      }
      if (this.isThreadStatic || this.isLiteral) {
        raise(`cannot write the value of field ${this.name} as it's thread static or literal`);
      }
      const handle = (
        // pointer-like values should be passed as-is, but boxed
        // value types (primitives included) must be unboxed first
        value instanceof Il2Cpp3.Object && this.type.class.isValueType ? value.unbox() : value instanceof NativeStruct ? value.handle : value instanceof NativePointer ? value : Il2Cpp3.write(Memory.alloc(this.type.class.valueTypeSize), value, this.type)
      );
      Il2Cpp3.exports.fieldSetStaticValue(this.handle, handle);
    }
    /** */
    toString() {
      return `${this.isThreadStatic ? `[ThreadStatic] ` : ``}${this.isStatic ? `static ` : ``}${this.type.name} ${this.name}${this.isLiteral ? ` = ${this.type.class.isEnum ? Il2Cpp3.read(this.value.handle, this.type.class.baseType) : this.value}` : ``};${this.isThreadStatic || this.isLiteral ? `` : ` // 0x${this.offset.toString(16)}`}`;
    }
    /**
     * @internal
     * Binds the current field to a {@link Il2Cpp.Object} or a
     * {@link Il2Cpp.ValueType} (also known as *instances*), so that it is
     * possible to retrieve its value - see {@link Il2Cpp.Field.value} for
     * details. \
     * Binding a static field is forbidden.
     */
    bind(instance) {
      if (this.isStatic) {
        raise(`cannot bind static field ${this.class.type.name}::${this.name} to an instance`);
      }
      const offset = this.offset - (instance instanceof Il2Cpp3.ValueType ? Il2Cpp3.Object.headerSize : 0);
      return new Proxy(this, {
        get(target, property) {
          if (property == "value") {
            return Il2Cpp3.read(instance.handle.add(offset), target.type);
          }
          return Reflect.get(target, property);
        },
        set(target, property, value) {
          if (property == "value") {
            Il2Cpp3.write(instance.handle.add(offset), value, target.type);
            return true;
          }
          return Reflect.set(target, property, value);
        }
      });
    }
  }
  __decorate([
    lazy
  ], Field.prototype, "class", null);
  __decorate([
    lazy
  ], Field.prototype, "flags", null);
  __decorate([
    lazy
  ], Field.prototype, "isLiteral", null);
  __decorate([
    lazy
  ], Field.prototype, "isStatic", null);
  __decorate([
    lazy
  ], Field.prototype, "isThreadStatic", null);
  __decorate([
    lazy
  ], Field.prototype, "modifier", null);
  __decorate([
    lazy
  ], Field.prototype, "name", null);
  __decorate([
    lazy
  ], Field.prototype, "offset", null);
  __decorate([
    lazy
  ], Field.prototype, "type", null);
  Il2Cpp3.Field = Field;
})(Il2Cpp2 || (Il2Cpp2 = {}));
var Il2Cpp2;
(function(Il2Cpp3) {
  class GCHandle {
    handle;
    /** @internal */
    constructor(handle) {
      this.handle = handle;
    }
    /** Gets the object associated to this handle. */
    get target() {
      return new Il2Cpp3.Object(Il2Cpp3.exports.gcHandleGetTarget(this.handle)).asNullable();
    }
    /** Frees this handle. */
    free() {
      return Il2Cpp3.exports.gcHandleFree(this.handle);
    }
  }
  Il2Cpp3.GCHandle = GCHandle;
})(Il2Cpp2 || (Il2Cpp2 = {}));
var Il2Cpp2;
(function(Il2Cpp3) {
  let Image = class Image extends NativeStruct {
    /** Gets the assembly in which the current image is defined. */
    get assembly() {
      return new Il2Cpp3.Assembly(Il2Cpp3.exports.imageGetAssembly(this));
    }
    /** Gets the amount of classes defined in this image. */
    get classCount() {
      if (Il2Cpp3.exports.imageGetClassCount.isNull()) {
        return this.classes.length;
      } else {
        return Il2Cpp3.exports.imageGetClassCount(this);
      }
    }
    /** Gets the classes defined in this image. */
    get classes() {
      if (Il2Cpp3.exports.imageGetClass.isNull()) {
        const types = this.assembly.object.method("GetTypes").invoke(false);
        const classes = globalThis.Array.from(types, (_) => new Il2Cpp3.Class(Il2Cpp3.exports.classFromObject(_)));
        const Module = this.tryClass("<Module>");
        if (Module) {
          classes.unshift(Module);
        }
        return classes;
      } else {
        return globalThis.Array.from(globalThis.Array(this.classCount), (_, i) => new Il2Cpp3.Class(Il2Cpp3.exports.imageGetClass(this, i)));
      }
    }
    /** Gets the name of this image. */
    get name() {
      return Il2Cpp3.exports.imageGetName(this).readUtf8String();
    }
    /** Gets the class with the specified name defined in this image. */
    class(name) {
      return this.tryClass(name) ?? raise(`couldn't find class ${name} in assembly ${this.name}`);
    }
    /** Gets the class with the specified name defined in this image. */
    tryClass(name) {
      const dotIndex = name.lastIndexOf(".");
      const classNamespace = Memory.allocUtf8String(dotIndex == -1 ? "" : name.slice(0, dotIndex));
      const className = Memory.allocUtf8String(name.slice(dotIndex + 1));
      return new Il2Cpp3.Class(Il2Cpp3.exports.classFromName(this, classNamespace, className)).asNullable();
    }
  };
  __decorate([
    lazy
  ], Image.prototype, "assembly", null);
  __decorate([
    lazy
  ], Image.prototype, "classCount", null);
  __decorate([
    lazy
  ], Image.prototype, "classes", null);
  __decorate([
    lazy
  ], Image.prototype, "name", null);
  Image = __decorate([
    recycle
  ], Image);
  Il2Cpp3.Image = Image;
  getter(Il2Cpp3, "corlib", () => {
    return new Il2Cpp3.Image(Il2Cpp3.exports.getCorlib());
  }, lazy);
})(Il2Cpp2 || (Il2Cpp2 = {}));
var Il2Cpp2;
(function(Il2Cpp3) {
  class MemorySnapshot extends NativeStruct {
    /** Captures a memory snapshot. */
    static capture() {
      return new Il2Cpp3.MemorySnapshot();
    }
    /** Creates a memory snapshot with the given handle. */
    constructor(handle = Il2Cpp3.exports.memorySnapshotCapture()) {
      super(handle);
    }
    /** Gets any initialized class. */
    get classes() {
      return readNativeIterator((_) => Il2Cpp3.exports.memorySnapshotGetClasses(this, _)).map((_) => new Il2Cpp3.Class(_));
    }
    /** Gets the objects tracked by this memory snapshot. */
    get objects() {
      return readNativeList((_) => Il2Cpp3.exports.memorySnapshotGetObjects(this, _)).filter((_) => !_.isNull()).map((_) => new Il2Cpp3.Object(_));
    }
    /** Frees this memory snapshot. */
    free() {
      Il2Cpp3.exports.memorySnapshotFree(this);
    }
  }
  __decorate([
    lazy
  ], MemorySnapshot.prototype, "classes", null);
  __decorate([
    lazy
  ], MemorySnapshot.prototype, "objects", null);
  Il2Cpp3.MemorySnapshot = MemorySnapshot;
  function memorySnapshot(block) {
    const memorySnapshot2 = Il2Cpp3.MemorySnapshot.capture();
    const result = block(memorySnapshot2);
    memorySnapshot2.free();
    return result;
  }
  Il2Cpp3.memorySnapshot = memorySnapshot;
})(Il2Cpp2 || (Il2Cpp2 = {}));
var Il2Cpp2;
(function(Il2Cpp3) {
  class Method extends NativeStruct {
    /** Gets the class in which this method is defined. */
    get class() {
      return new Il2Cpp3.Class(Il2Cpp3.exports.methodGetClass(this));
    }
    /** Gets the flags of the current method. */
    get flags() {
      return Il2Cpp3.exports.methodGetFlags(this, NULL);
    }
    /** Gets the implementation flags of the current method. */
    get implementationFlags() {
      const implementationFlagsPointer = Memory.alloc(Process.pointerSize);
      Il2Cpp3.exports.methodGetFlags(this, implementationFlagsPointer);
      return implementationFlagsPointer.readU32();
    }
    /** */
    get fridaSignature() {
      const types = [];
      for (const parameter of this.parameters) {
        types.push(parameter.type.fridaAlias);
      }
      if (this.nativeSignatureHasInstanceSlot) {
        types.unshift("pointer");
      }
      if (this.isInflated) {
        types.push("pointer");
      }
      return types;
    }
    /** Gets the generic parameters of this generic method. */
    get generics() {
      if (!this.isGeneric) {
        return [];
      }
      const types = this.object.method("GetGenericArguments").invoke();
      return globalThis.Array.from(types).map((_) => new Il2Cpp3.Class(Il2Cpp3.exports.classFromObject(_)));
    }
    /** Determines whether this method is external. */
    get isExternal() {
      return (this.implementationFlags & 4096) != 0;
    }
    /** Determines whether this method is generic. */
    get isGeneric() {
      return !!Il2Cpp3.exports.methodIsGeneric(this);
    }
    /** Determines whether this method is inflated (generic with a concrete type parameter). */
    get isInflated() {
      return !!Il2Cpp3.exports.methodIsInflated(this);
    }
    /** Determines whether this method is static. */
    get isStatic() {
      return !Il2Cpp3.exports.methodIsInstance(this);
    }
    /** Determines whether this method is synchronized. */
    get isSynchronized() {
      return (this.implementationFlags & 32) != 0;
    }
    /** Gets the access modifier of this method. */
    get modifier() {
      switch (this.flags & 7) {
        case 1:
          return "private";
        case 2:
          return "private protected";
        case 3:
          return "internal";
        case 4:
          return "protected";
        case 5:
          return "protected internal";
        case 6:
          return "public";
      }
    }
    /** Gets the name of this method. */
    get name() {
      return Il2Cpp3.exports.methodGetName(this).readUtf8String();
    }
    /** @internal */
    get nativeFunction() {
      return new NativeFunction(this.virtualAddress, this.returnType.fridaAlias, this.fridaSignature);
    }
    /** @internal */
    get nativeSignatureHasInstanceSlot() {
      return !this.isStatic || staticMethodsRequireInstanceParam();
    }
    /** Gets the encompassing object of the current method. */
    get object() {
      return new Il2Cpp3.Object(Il2Cpp3.exports.methodGetObject(this, NULL));
    }
    /** Gets the amount of parameters of this method. */
    get parameterCount() {
      return Il2Cpp3.exports.methodGetParameterCount(this);
    }
    /** Gets the parameters of this method. */
    get parameters() {
      return globalThis.Array.from(globalThis.Array(this.parameterCount), (_, i) => {
        const parameterName = Il2Cpp3.exports.methodGetParameterName(this, i).readUtf8String();
        const parameterType = Il2Cpp3.exports.methodGetParameterType(this, i);
        return new Il2Cpp3.Parameter(parameterName, i, new Il2Cpp3.Type(parameterType));
      });
    }
    /** Gets the relative virtual address (RVA) of this method. */
    get relativeVirtualAddress() {
      return this.virtualAddress.sub(Il2Cpp3.module.base);
    }
    /** Gets the return type of this method. */
    get returnType() {
      return new Il2Cpp3.Type(Il2Cpp3.exports.methodGetReturnType(this));
    }
    /** Gets the virtual address (VA) of this method. */
    get virtualAddress() {
      const offset = virtualAddressOffset();
      getter(Il2Cpp3.Method.prototype, "virtualAddress", function() {
        return this.handle.add(offset).readPointer();
      }, lazy);
      Il2Cpp3.corlib.class("System.Reflection.Module").method(".cctor").invoke();
      return this.virtualAddress;
    }
    /** Replaces the body of this method. */
    set implementation(block) {
      try {
        Interceptor.replace(this.virtualAddress, this.wrap(block));
      } catch (e) {
        switch (e.message) {
          case "access violation accessing 0x0":
            raise(`couldn't set implementation for method ${this.name} as it has a NULL virtual address`);
          case /unable to intercept function at \w+; please file a bug/.exec(e.message)?.input:
            warn(`couldn't set implementation for method ${this.name} as it may be a thunk`);
            break;
          case "already replaced this function":
            warn(`couldn't set implementation for method ${this.name} as it has already been replaced by a thunk`);
            break;
          default:
            throw e;
        }
      }
    }
    /** Creates a generic instance of the current generic method. */
    inflate(...classes) {
      if (!this.isGeneric || this.generics.length != classes.length) {
        for (const method of this.overloads()) {
          if (method.isGeneric && method.generics.length == classes.length) {
            return method.inflate(...classes);
          }
        }
        raise(`could not find inflatable signature of method ${this.name} with ${classes.length} generic parameter(s)`);
      }
      const types = classes.map((_) => _.type.object);
      const typeArray = Il2Cpp3.array(Il2Cpp3.corlib.class("System.Type"), types);
      const inflatedMethodObject = this.object.method("MakeGenericMethod", 1).invoke(typeArray);
      return new Il2Cpp3.Method(inflatedMethodObject.field("mhandle").value);
    }
    /** Invokes this method. */
    invoke(...parameters) {
      if (!this.isStatic) {
        raise(`cannot invoke non-static method ${this.name} as it must be invoked throught a Il2Cpp.Object, not a Il2Cpp.Class`);
      }
      return this.invokeRaw(NULL, ...parameters);
    }
    /** @internal */
    invokeRaw(instance, ...parameters) {
      const allocatedParameters = parameters.map(Il2Cpp3.toFridaValue);
      if (this.nativeSignatureHasInstanceSlot) {
        allocatedParameters.unshift(instance);
      }
      if (this.isInflated) {
        allocatedParameters.push(this.handle);
      }
      try {
        const returnValue = this.nativeFunction(...allocatedParameters);
        return Il2Cpp3.fromFridaValue(returnValue, this.returnType);
      } catch (e) {
        if (e == null) {
          raise("an unexpected native invocation exception occurred, this is due to parameter types mismatch");
        }
        switch (e.message) {
          case "bad argument count":
            raise(`couldn't invoke method ${this.name} as it needs ${this.parameterCount} parameter(s), not ${parameters.length}`);
          case "expected a pointer":
          case "expected number":
          case "expected array with fields":
            raise(`couldn't invoke method ${this.name} using incorrect parameter types`);
        }
        throw e;
      }
    }
    /** Gets the overloaded method with the given parameter types. */
    overload(...typeNamesOrClasses) {
      const method = this.tryOverload(...typeNamesOrClasses);
      return method ?? raise(`couldn't find overloaded method ${this.name}(${typeNamesOrClasses.map((_) => _ instanceof Il2Cpp3.Class ? _.type.name : _)})`);
    }
    /** @internal */
    *overloads() {
      for (const klass of this.class.hierarchy()) {
        for (const method of klass.methods) {
          if (this.name == method.name) {
            yield method;
          }
        }
      }
    }
    /** Gets the parameter with the given name. */
    parameter(name) {
      return this.tryParameter(name) ?? raise(`couldn't find parameter ${name} in method ${this.name}`);
    }
    /** Restore the original method implementation. */
    revert() {
      Interceptor.revert(this.virtualAddress);
      Interceptor.flush();
    }
    /** Gets the overloaded method with the given parameter types. */
    tryOverload(...typeNamesOrClasses) {
      const minScore = typeNamesOrClasses.length * 1;
      const maxScore = typeNamesOrClasses.length * 2;
      let candidate = void 0;
      loop: for (const method of this.overloads()) {
        if (method.parameterCount != typeNamesOrClasses.length)
          continue;
        let score = 0;
        let i = 0;
        for (const parameter of method.parameters) {
          const desiredTypeNameOrClass = typeNamesOrClasses[i];
          if (desiredTypeNameOrClass instanceof Il2Cpp3.Class) {
            if (parameter.type.is(desiredTypeNameOrClass.type)) {
              score += 2;
            } else if (parameter.type.class.isAssignableFrom(desiredTypeNameOrClass)) {
              score += 1;
            } else {
              continue loop;
            }
          } else if (parameter.type.name == desiredTypeNameOrClass) {
            score += 2;
          } else {
            continue loop;
          }
          i++;
        }
        if (score < minScore) {
          continue;
        } else if (score == maxScore) {
          return method;
        } else if (candidate == void 0 || score > candidate[0]) {
          candidate = [score, method];
        } else if (score == candidate[0]) {
          let i2 = 0;
          for (const parameter of candidate[1].parameters) {
            if (parameter.type.class.isAssignableFrom(method.parameters[i2].type.class)) {
              candidate = [score, method];
              continue loop;
            }
            i2++;
          }
        }
      }
      return candidate?.[1];
    }
    /** Gets the parameter with the given name. */
    tryParameter(name) {
      return this.parameters.find((_) => _.name == name);
    }
    /** */
    toString() {
      return `${this.isStatic ? `static ` : ``}${this.returnType.name} ${this.name}${this.generics.length > 0 ? `<${this.generics.map((_) => _.type.name).join(",")}>` : ""}(${this.parameters.join(`, `)});${this.virtualAddress.isNull() ? `` : ` // 0x${this.relativeVirtualAddress.toString(16).padStart(8, `0`)}`}`;
    }
    /**
     * @internal
     * Binds the current method to a {@link Il2Cpp.Object} or a
     * {@link Il2Cpp.ValueType} (also known as *instances*), so that it is
     * possible to invoke it - see {@link Il2Cpp.Method.invoke} for
     * details. \
     * Binding a static method is forbidden.
     */
    bind(instance) {
      if (this.isStatic) {
        raise(`cannot bind static method ${this.class.type.name}::${this.name} to an instance`);
      }
      return new Proxy(this, {
        get(target, property, receiver) {
          switch (property) {
            case "invoke":
              const handle = instance instanceof Il2Cpp3.ValueType ? target.class.isValueType ? instance.handle.sub(structMethodsRequireObjectInstances() ? Il2Cpp3.Object.headerSize : 0) : raise(`cannot invoke method ${target.class.type.name}::${target.name} against a value type, you must box it first`) : target.class.isValueType ? instance.handle.add(structMethodsRequireObjectInstances() ? 0 : Il2Cpp3.Object.headerSize) : instance.handle;
              return target.invokeRaw.bind(target, handle);
            case "overloads":
              return function* () {
                for (const method of target[property]()) {
                  if (!method.isStatic) {
                    yield method;
                  }
                }
              };
            case "inflate":
            case "overload":
            case "tryOverload":
              const member = Reflect.get(target, property).bind(receiver);
              return function(...args) {
                return member(...args)?.bind(instance);
              };
          }
          return Reflect.get(target, property);
        }
      });
    }
    /** @internal */
    wrap(block) {
      const parameterStartIndex = +this.nativeSignatureHasInstanceSlot;
      return new NativeCallback((...args) => {
        const thisObject = this.isStatic ? this.class : this.class.isValueType ? new Il2Cpp3.ValueType(args[0].add(structMethodsRequireObjectInstances() ? Il2Cpp3.Object.headerSize : 0), this.class.type) : new Il2Cpp3.Object(args[0]);
        const parameters = this.parameters.map((_, i) => Il2Cpp3.fromFridaValue(args[i + parameterStartIndex], _.type));
        const result = block.call(thisObject, ...parameters);
        return Il2Cpp3.toFridaValue(result);
      }, this.returnType.fridaAlias, this.fridaSignature);
    }
    /**
     * Attempts to find a {@link Il2Cpp.Method} given its virtual address, that is, the native
     * function's first instruction address.
     *
     * Please note that different generic methods (or methods belonging to generic classes) may
     * share the same virtual address due to IL2CPP generic sharing: as a consequence, an
     * unexpected `Il2Cpp.Method` might be returned. However, such shared virtual addresses are
     * not actually invocable, so any address taken from runtime execution (e.g. from tracing)
     * is not affected.
     *
     * To resolve a method from any address within the native function body, use
     * {@link Il2Cpp.Method.fromAnyAddress}.
     * ```ts
     * const virtualAddress: NativePointer = ...;
     * Il2Cpp.Method.fromVirtualAddress(virtualAddress);
     * ```
     */
    static fromVirtualAddress(virtualAddress) {
      return this.tryFromVirtualAddress(virtualAddress) ?? raise(`couldn't find method at virtual address ${virtualAddress}`);
    }
    /**
     * Just like {@link Il2Cpp.Method.fromVirtualAddress}, but returns `undefined` if no method
     * is found.
     * ```ts
     * const virtualAddress: NativePointer = ...;
     * Il2Cpp.Method.tryFromVirtualAddress(virtualAddress);
     * ```
     */
    static tryFromVirtualAddress(virtualAddress) {
      if (virtualAddress.isNull()) {
        raise("method virtual address cannot be null");
      }
      const rangeProvider = function* () {
        yield* rangesHavingMethodDefinitionsCache.values();
        yield* Process.enumerateRanges("rw-").filter((_) => _.file == void 0);
      };
      for (const range of rangeProvider()) {
        let matches;
        try {
          matches = Memory.scanSync(range.base, range.size, virtualAddress.toMatchPattern());
        } catch (_) {
          continue;
        }
        for (const { address } of matches) {
          const method = new Il2Cpp3.Method(address.sub(virtualAddressOffset()));
          try {
            if (method.name == null) {
              continue;
            }
          } catch (_) {
            continue;
          }
          const currentRange = rangesHavingMethodDefinitionsCache.get(range.base.toInt32());
          if (currentRange == void 0 || currentRange.size != range.size) {
            rangesHavingMethodDefinitionsCache.set(range.base.toInt32(), range);
          }
          return method;
        }
      }
    }
    /**
     * Attempts to find a {@link Il2Cpp.Method} given its relative virtual address, that is,
     * the native function's first instruction offset from the IL2CPP module base.
     * ```ts
     * Il2Cpp.Method.fromRelativeVirtualAddress("0x004ac1e");
     * ```
     */
    static fromRelativeVirtualAddress(relativeVirtualAddress) {
      return this.tryFromRelativeVirtualAddress(relativeVirtualAddress) ?? raise(`couldn't find method with RVA 0x${relativeVirtualAddress.toString(16)}`);
    }
    /**
     * Just like {@link Il2Cpp.Method.fromRelativeVirtualAddress}, but returns `undefined`
     * if no method is found.
     * ```ts
     * Il2Cpp.Method.tryFromVirtualAddress("0x004ac1e");
     * ```
     */
    static tryFromRelativeVirtualAddress(relativeVirtualAddress) {
      return this.tryFromVirtualAddress(Il2Cpp3.module.base.add(ptr(relativeVirtualAddress)));
    }
    /**
     * Attempts to find the {@link Il2Cpp.Method} whose native function contains the given
     * address.
     * Unlike {@link Il2Cpp.Method.fromVirtualAddress}, this accepts any address within the
     * native function body, not only its first instruction address.
     *
     * This combines {@link Process.findFunctionRange} and
     * {@link Il2Cpp.Method.fromVirtualAddress}.
     * ```ts
     * const address: NativePointer = ...;
     * Il2Cpp.Method.fromAnyAddress(address);
     * ```
     */
    static fromAnyAddress(address) {
      return this.tryFromAnyAddress(address) ?? raise(`couldn't find method containing address ${address}`);
    }
    /**
     * Just like {@link Il2Cpp.Method.fromAnyAddress}, but returns `undefined` if no method
     * is found.
     * ```ts
     * const address: NativePointer = ...;
     * Il2Cpp.Method.tryFromAnyAddress(address);
     * ```
     */
    static tryFromAnyAddress(address) {
      const range = Process.findFunctionRange(address);
      return range == null ? void 0 : this.tryFromVirtualAddress(range.base);
    }
  }
  __decorate([
    lazy
  ], Method.prototype, "class", null);
  __decorate([
    lazy
  ], Method.prototype, "flags", null);
  __decorate([
    lazy
  ], Method.prototype, "implementationFlags", null);
  __decorate([
    lazy
  ], Method.prototype, "fridaSignature", null);
  __decorate([
    lazy
  ], Method.prototype, "generics", null);
  __decorate([
    lazy
  ], Method.prototype, "isExternal", null);
  __decorate([
    lazy
  ], Method.prototype, "isGeneric", null);
  __decorate([
    lazy
  ], Method.prototype, "isInflated", null);
  __decorate([
    lazy
  ], Method.prototype, "isStatic", null);
  __decorate([
    lazy
  ], Method.prototype, "isSynchronized", null);
  __decorate([
    lazy
  ], Method.prototype, "modifier", null);
  __decorate([
    lazy
  ], Method.prototype, "name", null);
  __decorate([
    lazy
  ], Method.prototype, "nativeFunction", null);
  __decorate([
    lazy
  ], Method.prototype, "object", null);
  __decorate([
    lazy
  ], Method.prototype, "parameterCount", null);
  __decorate([
    lazy
  ], Method.prototype, "parameters", null);
  __decorate([
    lazy
  ], Method.prototype, "relativeVirtualAddress", null);
  __decorate([
    lazy
  ], Method.prototype, "returnType", null);
  Il2Cpp3.Method = Method;
  let staticMethodsRequireInstanceParam = () => {
    const SystemObject = Il2Cpp3.corlib.class("System.Object");
    const Equals = new NativeFunction(SystemObject.method("Equals", 2).virtualAddress, "bool", ["pointer", "pointer"]);
    const sentinel = SystemObject.new();
    const equality = Equals(sentinel, sentinel);
    const result = !equality;
    return (staticMethodsRequireInstanceParam = () => result)();
  };
  let structMethodsRequireObjectInstances = () => {
    const object = Il2Cpp3.corlib.class("System.Int64").alloc();
    object.field("m_value").value = 3735928559;
    const result = object.method("Equals", 1).overload(object.class).invokeRaw(object, 3735928559);
    return (structMethodsRequireObjectInstances = () => result)();
  };
  let virtualAddressOffset = () => {
    const FilterTypeName = Il2Cpp3.corlib.class("System.Reflection.Module").initialize().field("FilterTypeName").value;
    const FilterTypeNameMethodPointer = FilterTypeName.field("method_ptr").value;
    const FilterTypeNameMethod = FilterTypeName.field("method").value;
    const offset = FilterTypeNameMethod.offsetOf((_) => _.readPointer().equals(FilterTypeNameMethodPointer)) ?? raise("couldn't find the virtual address offset in the native method struct");
    return (virtualAddressOffset = () => offset)();
  };
  const rangesHavingMethodDefinitionsCache = /* @__PURE__ */ new Map();
})(Il2Cpp2 || (Il2Cpp2 = {}));
var Il2Cpp2;
(function(Il2Cpp3) {
  class Object2 extends NativeStruct {
    /** Gets the Il2CppObject struct size, possibly equal to `Process.pointerSize * 2`. */
    static get headerSize() {
      return Il2Cpp3.corlib.class("System.Object").instanceSize;
    }
    /**
     * Returns the same object, but having its parent class as class.
     * It basically is the C# `base` keyword, so that parent members can be
     * accessed.
     *
     * **Example** \
     * Consider the following classes:
     * ```csharp
     * class Foo
     * {
     *     int foo()
     *     {
     *          return 1;
     *     }
     * }
     * class Bar : Foo
     * {
     *     new int foo()
     *     {
     *          return 2;
     *     }
     * }
     * ```
     * then:
     * ```ts
     * const Bar: Il2Cpp.Class = ...;
     * const bar = Bar.new();
     *
     * console.log(bar.foo()); // 2
     * console.log(bar.base.foo()); // 1
     * ```
     */
    get base() {
      if (this.class.parent == null) {
        raise(`class ${this.class.type.name} has no parent`);
      }
      return new Proxy(this, {
        get(target, property, receiver) {
          if (property == "class") {
            return Reflect.get(target, property).parent;
          } else if (property == "base") {
            return Reflect.getOwnPropertyDescriptor(Il2Cpp3.Object.prototype, property).get.bind(receiver)();
          }
          return Reflect.get(target, property);
        }
      });
    }
    /** Gets the class of this object. */
    get class() {
      return new Il2Cpp3.Class(Il2Cpp3.exports.objectGetClass(this));
    }
    /** Returns a monitor for this object. */
    get monitor() {
      return new Il2Cpp3.Object.Monitor(this);
    }
    /** Gets the size of the current object. */
    get size() {
      return Il2Cpp3.exports.objectGetSize(this);
    }
    /** Gets the non-static field with the given name of the current class hierarchy. */
    field(name) {
      return this.tryField(name) ?? raise(`couldn't find non-static field ${name} in hierarchy of class ${this.class.type.name}`);
    }
    /** Gets the non-static method with the given name (and optionally parameter count) of the current class hierarchy. */
    method(name, parameterCount = -1) {
      return this.tryMethod(name, parameterCount) ?? raise(`couldn't find non-static method ${name} in hierarchy of class ${this.class.type.name}`);
    }
    /** Creates a reference to this object. */
    ref(pin) {
      return new Il2Cpp3.GCHandle(Il2Cpp3.exports.gcHandleNew(this, +pin));
    }
    /** Gets the correct virtual method from the given virtual method. */
    virtualMethod(method) {
      return new Il2Cpp3.Method(Il2Cpp3.exports.objectGetVirtualMethod(this, method)).bind(this);
    }
    /** Gets the non-static field with the given name of the current class hierarchy, if it exists. */
    tryField(name) {
      const field = this.class.tryField(name);
      if (field?.isStatic) {
        for (const klass of this.class.hierarchy({ includeCurrent: false })) {
          for (const field2 of klass.fields) {
            if (field2.name == name && !field2.isStatic) {
              return field2.bind(this);
            }
          }
        }
        return void 0;
      }
      return field?.bind(this);
    }
    /** Gets the non-static method with the given name (and optionally parameter count) of the current class hierarchy, if it exists. */
    tryMethod(name, parameterCount = -1) {
      const method = this.class.tryMethod(name, parameterCount);
      if (method?.isStatic) {
        for (const klass of this.class.hierarchy()) {
          for (const method2 of klass.methods) {
            if (method2.name == name && !method2.isStatic && (parameterCount < 0 || method2.parameterCount == parameterCount)) {
              return method2.bind(this);
            }
          }
        }
        return void 0;
      }
      return method?.bind(this);
    }
    /** */
    toString() {
      return this.isNull() ? "null" : this.method("ToString", 0).invoke().content ?? "null";
    }
    /** Unboxes the value type (either a primitive, a struct or an enum) out of this object. */
    unbox() {
      return this.class.isValueType ? new Il2Cpp3.ValueType(Il2Cpp3.exports.objectUnbox(this), this.class.type) : raise(`couldn't unbox instances of ${this.class.type.name} as they are not value types`);
    }
    /** Creates a weak reference to this object. */
    weakRef(trackResurrection) {
      return new Il2Cpp3.GCHandle(Il2Cpp3.exports.gcHandleNewWeakRef(this, +trackResurrection));
    }
  }
  __decorate([
    lazy
  ], Object2.prototype, "class", null);
  __decorate([
    lazy
  ], Object2.prototype, "size", null);
  __decorate([
    lazy
  ], Object2, "headerSize", null);
  Il2Cpp3.Object = Object2;
  (function(Object3) {
    class Monitor {
      handle;
      /** @internal */
      constructor(handle) {
        this.handle = handle;
      }
      /** Acquires an exclusive lock on the current object. */
      enter() {
        return Il2Cpp3.exports.monitorEnter(this.handle);
      }
      /** Release an exclusive lock on the current object. */
      exit() {
        return Il2Cpp3.exports.monitorExit(this.handle);
      }
      /** Notifies a thread in the waiting queue of a change in the locked object's state. */
      pulse() {
        return Il2Cpp3.exports.monitorPulse(this.handle);
      }
      /** Notifies all waiting threads of a change in the object's state. */
      pulseAll() {
        return Il2Cpp3.exports.monitorPulseAll(this.handle);
      }
      /** Attempts to acquire an exclusive lock on the current object. */
      tryEnter(timeout) {
        return !!Il2Cpp3.exports.monitorTryEnter(this.handle, timeout);
      }
      /** Releases the lock on an object and attempts to block the current thread until it reacquires the lock. */
      tryWait(timeout) {
        return !!Il2Cpp3.exports.monitorTryWait(this.handle, timeout);
      }
      /** Releases the lock on an object and blocks the current thread until it reacquires the lock. */
      wait() {
        return Il2Cpp3.exports.monitorWait(this.handle);
      }
    }
    Object3.Monitor = Monitor;
  })(Object2 = Il2Cpp3.Object || (Il2Cpp3.Object = {}));
})(Il2Cpp2 || (Il2Cpp2 = {}));
var Il2Cpp2;
(function(Il2Cpp3) {
  class Parameter {
    /** Name of this parameter. */
    name;
    /** Position of this parameter. */
    position;
    /** Type of this parameter. */
    type;
    constructor(name, position, type) {
      this.name = name;
      this.position = position;
      this.type = type;
    }
    /** */
    toString() {
      return `${this.type.name} ${this.name}`;
    }
  }
  Il2Cpp3.Parameter = Parameter;
})(Il2Cpp2 || (Il2Cpp2 = {}));
var Il2Cpp2;
(function(Il2Cpp3) {
  class Pointer extends NativeStruct {
    type;
    constructor(handle, type) {
      super(handle);
      this.type = type;
    }
    /** Gets the element at the given index. */
    get(index) {
      return Il2Cpp3.read(this.handle.add(index * this.type.class.arrayElementSize), this.type);
    }
    /** Reads the given amount of elements starting at the given offset. */
    read(length2, offset = 0) {
      const values = new globalThis.Array(length2);
      for (let i = 0; i < length2; i++) {
        values[i] = this.get(i + offset);
      }
      return values;
    }
    /** Sets the given element at the given index */
    set(index, value) {
      Il2Cpp3.write(this.handle.add(index * this.type.class.arrayElementSize), value, this.type);
    }
    /** */
    toString() {
      return this.handle.toString();
    }
    /** Writes the given elements starting at the given index. */
    write(values, offset = 0) {
      for (let i = 0; i < values.length; i++) {
        this.set(i + offset, values[i]);
      }
    }
  }
  Il2Cpp3.Pointer = Pointer;
})(Il2Cpp2 || (Il2Cpp2 = {}));
var Il2Cpp2;
(function(Il2Cpp3) {
  class Reference extends NativeStruct {
    type;
    constructor(handle, type) {
      super(handle);
      this.type = type;
    }
    /** Gets the element referenced by the current reference. */
    get value() {
      return Il2Cpp3.read(this.handle, this.type);
    }
    /** Sets the element referenced by the current reference. */
    set value(value) {
      Il2Cpp3.write(this.handle, value, this.type);
    }
    /** */
    toString() {
      return this.isNull() ? "null" : `->${this.value}`;
    }
  }
  Il2Cpp3.Reference = Reference;
  function reference(value, type) {
    const handle = Memory.alloc(Process.pointerSize);
    switch (typeof value) {
      case "boolean":
        return new Il2Cpp3.Reference(handle.writeS8(+value), Il2Cpp3.corlib.class("System.Boolean").type);
      case "number":
        switch (type?.enumValue) {
          case Il2Cpp3.Type.Enum.UBYTE:
            return new Il2Cpp3.Reference(handle.writeU8(value), type);
          case Il2Cpp3.Type.Enum.BYTE:
            return new Il2Cpp3.Reference(handle.writeS8(value), type);
          case Il2Cpp3.Type.Enum.CHAR:
          case Il2Cpp3.Type.Enum.USHORT:
            return new Il2Cpp3.Reference(handle.writeU16(value), type);
          case Il2Cpp3.Type.Enum.SHORT:
            return new Il2Cpp3.Reference(handle.writeS16(value), type);
          case Il2Cpp3.Type.Enum.UINT:
            return new Il2Cpp3.Reference(handle.writeU32(value), type);
          case Il2Cpp3.Type.Enum.INT:
            return new Il2Cpp3.Reference(handle.writeS32(value), type);
          case Il2Cpp3.Type.Enum.ULONG:
            return new Il2Cpp3.Reference(handle.writeU64(value), type);
          case Il2Cpp3.Type.Enum.LONG:
            return new Il2Cpp3.Reference(handle.writeS64(value), type);
          case Il2Cpp3.Type.Enum.FLOAT:
            return new Il2Cpp3.Reference(handle.writeFloat(value), type);
          case Il2Cpp3.Type.Enum.DOUBLE:
            return new Il2Cpp3.Reference(handle.writeDouble(value), type);
        }
      case "object":
        if (value instanceof Il2Cpp3.ValueType || value instanceof Il2Cpp3.Pointer) {
          return new Il2Cpp3.Reference(value.handle, value.type);
        } else if (value instanceof Il2Cpp3.Object) {
          return new Il2Cpp3.Reference(handle.writePointer(value), value.class.type);
        } else if (value instanceof Il2Cpp3.String || value instanceof Il2Cpp3.Array) {
          return new Il2Cpp3.Reference(handle.writePointer(value), value.object.class.type);
        } else if (value instanceof NativePointer) {
          switch (type?.enumValue) {
            case Il2Cpp3.Type.Enum.NUINT:
            case Il2Cpp3.Type.Enum.NINT:
              return new Il2Cpp3.Reference(handle.writePointer(value), type);
          }
        } else if (value instanceof Int64) {
          return new Il2Cpp3.Reference(handle.writeS64(value), Il2Cpp3.corlib.class("System.Int64").type);
        } else if (value instanceof UInt64) {
          return new Il2Cpp3.Reference(handle.writeU64(value), Il2Cpp3.corlib.class("System.UInt64").type);
        }
      default:
        raise(`couldn't create a reference to ${value} using an unhandled type ${type?.name}`);
    }
  }
  Il2Cpp3.reference = reference;
})(Il2Cpp2 || (Il2Cpp2 = {}));
var Il2Cpp2;
(function(Il2Cpp3) {
  class String2 extends NativeStruct {
    /** Gets the content of this string. */
    get content() {
      return Il2Cpp3.exports.stringGetChars(this).readUtf16String(this.length);
    }
    /** @unsafe Sets the content of this string - it may write out of bounds! */
    set content(value) {
      const offset = Il2Cpp3.string("vfsfitvnm").handle.offsetOf((_) => _.readInt() == 9) ?? raise("couldn't find the length offset in the native string struct");
      globalThis.Object.defineProperty(Il2Cpp3.String.prototype, "content", {
        set(value2) {
          Il2Cpp3.exports.stringGetChars(this).writeUtf16String(value2 ?? "");
          this.handle.add(offset).writeS32(value2?.length ?? 0);
        }
      });
      this.content = value;
    }
    /** Gets the length of this string. */
    get length() {
      return Il2Cpp3.exports.stringGetLength(this);
    }
    /** Gets the encompassing object of the current string. */
    get object() {
      return new Il2Cpp3.Object(this);
    }
    /** */
    toString() {
      return this.isNull() ? "null" : `"${this.content}"`;
    }
  }
  Il2Cpp3.String = String2;
  function string(content) {
    return new Il2Cpp3.String(Il2Cpp3.exports.stringNew(Memory.allocUtf8String(content ?? "")));
  }
  Il2Cpp3.string = string;
})(Il2Cpp2 || (Il2Cpp2 = {}));
var Il2Cpp2;
(function(Il2Cpp3) {
  class Thread extends NativeStruct {
    /**
     * Gets the managed thread associated with the given native thread id (if any).
     *
     * This is an alternative to {@link Il2Cpp.attachedThreads}:
     * ```ts
     * async function findAllThreads() {
     *     const promises = Process.enumerateThreads().map(thread => Il2Cpp.Thread.fromId(thread.id));
     *     return (await Promise.all(promises)).filter(thread => thread != null);
     * }
     * ```
     */
    static fromId(threadId) {
      return Process.runOnThread(threadId, () => Il2Cpp3.currentThread);
    }
    /**
     * Gets the native (operative system) thread id of this thread, or a negative number if
     * it's not available.
     */
    get id() {
      let get = function() {
        return this.internal.field("thread_id").value.toNumber();
      };
      if (Process.platform != "windows") {
        const currentThreadId = Process.getCurrentThreadId();
        const currentPosixThread = ptr(get.apply(Il2Cpp3.currentThread));
        const offset = currentPosixThread.offsetOf((_) => _.readS32() == currentThreadId, 1024) ?? raise(`couldn't find the offset for determining the kernel id of a posix thread`);
        const getPosixThreadHandle = get;
        get = function() {
          const handle = ptr(getPosixThreadHandle.apply(this));
          if (handle.isNull()) {
            warn(`couldn't find thread id for ${this.handle}; returning a negative number, expect breakage`);
            return -1;
          }
          return handle.add(offset).readS32();
        };
      }
      getter(Il2Cpp3.Thread.prototype, "id", get, lazy);
      return this.id;
    }
    /**
     * Gets the internal managed thread (`System.Threading.InternalThread`) of this thread - actually a
     * [`MonoInternalThread`](https://github.com/mono/mono/blob/0f53e9e151d92944cacab3e24ac359410c606df6/mono/metadata/object-internals.h#L575).
     */
    get internal() {
      return this.object.tryField("internal_thread")?.value ?? // in older Unity versions, `System.Threading.Thread` already was a `MonoInternalThread`
      this.object;
    }
    /** Determines whether the current thread is the garbage collector finalizer one. */
    get isFinalizer() {
      return !Il2Cpp3.exports.threadIsVm(this);
    }
    /** Gets the managed id of the current thread. */
    get managedId() {
      return this.object.method("get_ManagedThreadId").invoke();
    }
    /** Gets the encompassing object of the current thread. */
    get object() {
      return new Il2Cpp3.Object(this);
    }
    /** @internal */
    get staticData() {
      return this.internal.field("static_data").value;
    }
    /** @internal */
    get synchronizationContext() {
      const get_ExecutionContext = this.object.tryMethod("GetMutableExecutionContext") ?? this.object.method("get_ExecutionContext");
      const executionContext = get_ExecutionContext.invoke();
      const synchronizationContext = executionContext.tryField("_syncContext")?.value ?? executionContext.tryMethod("get_SynchronizationContext")?.invoke() ?? this.tryLocalValue(Il2Cpp3.corlib.class("System.Threading.SynchronizationContext"));
      return synchronizationContext?.asNullable() ?? null;
    }
    /** Detaches the thread from the application domain. */
    detach() {
      return Il2Cpp3.exports.threadDetach(this);
    }
    /** Schedules a callback on the current thread. */
    schedule(block) {
      const Post = this.synchronizationContext?.tryMethod("Post");
      if (Post == null) {
        return Process.runOnThread(this.id, block);
      }
      return new Promise((resolve) => {
        const delegate = Il2Cpp3.delegate(Il2Cpp3.corlib.class("System.Threading.SendOrPostCallback"), () => {
          const result = block();
          setImmediate(() => resolve(result));
        });
        Script.bindWeak(globalThis, () => {
          delegate.field("method_ptr").value = delegate.field("invoke_impl").value = Il2Cpp3.exports.domainGet;
        });
        Post.invoke(delegate, NULL);
      });
    }
    /** @internal */
    tryLocalValue(klass) {
      for (let i = 0; i < 16; i++) {
        const base = this.staticData.add(i * Process.pointerSize).readPointer();
        if (!base.isNull()) {
          const object = new Il2Cpp3.Object(base.readPointer()).asNullable();
          if (object?.class?.isSubclassOf(klass, false)) {
            return object;
          }
        }
      }
    }
  }
  __decorate([
    lazy
  ], Thread.prototype, "internal", null);
  __decorate([
    lazy
  ], Thread.prototype, "isFinalizer", null);
  __decorate([
    lazy
  ], Thread.prototype, "managedId", null);
  __decorate([
    lazy
  ], Thread.prototype, "object", null);
  __decorate([
    lazy
  ], Thread.prototype, "staticData", null);
  __decorate([
    lazy
  ], Thread.prototype, "synchronizationContext", null);
  Il2Cpp3.Thread = Thread;
  getter(Il2Cpp3, "attachedThreads", () => {
    if (Il2Cpp3.exports.threadGetAttachedThreads.isNull()) {
      const currentThread = Il2Cpp3.currentThread ?? raise("current thread is not attached to IL2CPP");
      const pattern = currentThread.handle.toMatchPattern();
      const rangeProvider = function* () {
        try {
          yield* Il2Cpp3.gc.heapSections;
        } catch (_) {
        }
        yield Process.getRangeByAddress(Il2Cpp3.corlib.assembly.object);
        yield Process.getRangeByAddress(Il2Cpp3.corlib.class("System.Threading.Thread").staticFieldsData);
        yield* Process.enumerateRanges("rw-").filter((_) => _.file == void 0);
      };
      for (const range of rangeProvider()) {
        let matches = [];
        try {
          matches = Memory.scanSync(range.base, range.size, pattern);
        } catch (_) {
        }
        if (matches.length == 1) {
          const threads = [];
          const iter = (index) => {
            const handle = matches[0].address.add(index * Process.pointerSize).readPointer();
            if (!handle.isNull() && Process.findRangeByAddress(handle) != null) {
              const thread = new Il2Cpp3.Thread(handle);
              if (thread.object.class.equals(currentThread.object.class)) {
                return threads.push(thread);
              }
            }
          };
          for (let i = 0; iter(i); i--)
            ;
          threads.reverse();
          for (let i = 1; iter(i); i++)
            ;
          return threads;
        }
      }
      raise("couldn't collect attached threads");
    }
    return readNativeList(Il2Cpp3.exports.threadGetAttachedThreads).map((_) => new Il2Cpp3.Thread(_));
  });
  getter(Il2Cpp3, "currentThread", () => {
    return new Il2Cpp3.Thread(Il2Cpp3.exports.threadGetCurrent()).asNullable();
  });
  getter(Il2Cpp3, "mainThread", () => {
    return Il2Cpp3.attachedThreads[0];
  });
})(Il2Cpp2 || (Il2Cpp2 = {}));
var Il2Cpp2;
(function(Il2Cpp3) {
  let Type = class Type extends NativeStruct {
    /** */
    static get Enum() {
      const _ = (_2, block = (_3) => _3) => block(Il2Cpp3.corlib.class(_2)).type.enumValue;
      const initial = {
        VOID: _("System.Void"),
        BOOLEAN: _("System.Boolean"),
        CHAR: _("System.Char"),
        BYTE: _("System.SByte"),
        UBYTE: _("System.Byte"),
        SHORT: _("System.Int16"),
        USHORT: _("System.UInt16"),
        INT: _("System.Int32"),
        UINT: _("System.UInt32"),
        LONG: _("System.Int64"),
        ULONG: _("System.UInt64"),
        NINT: _("System.IntPtr"),
        NUINT: _("System.UIntPtr"),
        FLOAT: _("System.Single"),
        DOUBLE: _("System.Double"),
        POINTER: _("System.IntPtr", (_2) => _2.field("m_value")),
        VALUE_TYPE: _("System.Decimal"),
        OBJECT: _("System.Object"),
        STRING: _("System.String"),
        CLASS: _("System.Array"),
        ARRAY: _("System.Void", (_2) => _2.arrayClass),
        NARRAY: _("System.Void", (_2) => new Il2Cpp3.Class(Il2Cpp3.exports.classGetArrayClass(_2, 2))),
        GENERIC_INSTANCE: _("System.Int32", (_2) => _2.interfaces.find((_3) => _3.name.endsWith("`1")))
      };
      Reflect.defineProperty(this, "Enum", { value: initial });
      return addFlippedEntries({
        ...initial,
        VAR: _("System.Action`1", (_2) => _2.generics[0]),
        MVAR: _("System.Array", (_2) => _2.method("AsReadOnly", 1).generics[0])
      });
    }
    /** Gets the class of this type. */
    get class() {
      return new Il2Cpp3.Class(Il2Cpp3.exports.typeGetClass(this));
    }
    /** */
    get fridaAlias() {
      function getValueTypeFields(type) {
        const instanceFields = type.class.fields.filter((_) => !_.isStatic);
        return instanceFields.length == 0 ? ["char"] : instanceFields.map((_) => _.type.fridaAlias);
      }
      if (this.isByReference) {
        return "pointer";
      }
      switch (this.enumValue) {
        case Il2Cpp3.Type.Enum.VOID:
          return "void";
        case Il2Cpp3.Type.Enum.BOOLEAN:
          return "bool";
        case Il2Cpp3.Type.Enum.CHAR:
          return "uchar";
        case Il2Cpp3.Type.Enum.BYTE:
          return "int8";
        case Il2Cpp3.Type.Enum.UBYTE:
          return "uint8";
        case Il2Cpp3.Type.Enum.SHORT:
          return "int16";
        case Il2Cpp3.Type.Enum.USHORT:
          return "uint16";
        case Il2Cpp3.Type.Enum.INT:
          return "int32";
        case Il2Cpp3.Type.Enum.UINT:
          return "uint32";
        case Il2Cpp3.Type.Enum.LONG:
          return "int64";
        case Il2Cpp3.Type.Enum.ULONG:
          return "uint64";
        case Il2Cpp3.Type.Enum.FLOAT:
          return "float";
        case Il2Cpp3.Type.Enum.DOUBLE:
          return "double";
        case Il2Cpp3.Type.Enum.NINT:
        case Il2Cpp3.Type.Enum.NUINT:
        case Il2Cpp3.Type.Enum.POINTER:
        case Il2Cpp3.Type.Enum.STRING:
        case Il2Cpp3.Type.Enum.ARRAY:
        case Il2Cpp3.Type.Enum.NARRAY:
          return "pointer";
        case Il2Cpp3.Type.Enum.VALUE_TYPE:
          return this.class.isEnum ? this.class.baseType.fridaAlias : getValueTypeFields(this);
        case Il2Cpp3.Type.Enum.CLASS:
        case Il2Cpp3.Type.Enum.OBJECT:
        case Il2Cpp3.Type.Enum.GENERIC_INSTANCE:
          return this.class.isStruct ? getValueTypeFields(this) : this.class.isEnum ? this.class.baseType.fridaAlias : "pointer";
        default:
          return "pointer";
      }
    }
    /** Determines whether this type is passed by reference. */
    get isByReference() {
      return this.name.endsWith("&");
    }
    /** Determines whether this type is primitive. */
    get isPrimitive() {
      switch (this.enumValue) {
        case Il2Cpp3.Type.Enum.BOOLEAN:
        case Il2Cpp3.Type.Enum.CHAR:
        case Il2Cpp3.Type.Enum.BYTE:
        case Il2Cpp3.Type.Enum.UBYTE:
        case Il2Cpp3.Type.Enum.SHORT:
        case Il2Cpp3.Type.Enum.USHORT:
        case Il2Cpp3.Type.Enum.INT:
        case Il2Cpp3.Type.Enum.UINT:
        case Il2Cpp3.Type.Enum.LONG:
        case Il2Cpp3.Type.Enum.ULONG:
        case Il2Cpp3.Type.Enum.FLOAT:
        case Il2Cpp3.Type.Enum.DOUBLE:
        case Il2Cpp3.Type.Enum.NINT:
        case Il2Cpp3.Type.Enum.NUINT:
          return true;
        default:
          return false;
      }
    }
    /** Gets the name of this type. */
    get name() {
      const handle = Il2Cpp3.exports.typeGetName(this);
      try {
        return handle.readUtf8String();
      } finally {
        Il2Cpp3.free(handle);
      }
    }
    /** Gets the encompassing object of the current type. */
    get object() {
      return new Il2Cpp3.Object(Il2Cpp3.exports.typeGetObject(this));
    }
    /** Gets the {@link Il2Cpp.Type.Enum} value of the current type. */
    get enumValue() {
      return Il2Cpp3.exports.typeGetTypeEnum(this);
    }
    is(other) {
      if (Il2Cpp3.exports.typeEquals.isNull()) {
        return this.object.method("Equals").invoke(other.object);
      }
      return !!Il2Cpp3.exports.typeEquals(this, other);
    }
    /** */
    toString() {
      return this.name;
    }
  };
  __decorate([
    lazy
  ], Type.prototype, "class", null);
  __decorate([
    lazy
  ], Type.prototype, "fridaAlias", null);
  __decorate([
    lazy
  ], Type.prototype, "isByReference", null);
  __decorate([
    lazy
  ], Type.prototype, "isPrimitive", null);
  __decorate([
    lazy
  ], Type.prototype, "name", null);
  __decorate([
    lazy
  ], Type.prototype, "object", null);
  __decorate([
    lazy
  ], Type.prototype, "enumValue", null);
  __decorate([
    lazy
  ], Type, "Enum", null);
  Type = __decorate([
    recycle
  ], Type);
  Il2Cpp3.Type = Type;
})(Il2Cpp2 || (Il2Cpp2 = {}));
var Il2Cpp2;
(function(Il2Cpp3) {
  class ValueType extends NativeStruct {
    type;
    constructor(handle, type) {
      super(handle);
      this.type = type;
    }
    /** Boxes the current value type in a object. */
    box() {
      return new Il2Cpp3.Object(Il2Cpp3.exports.valueTypeBox(this.type.class, this));
    }
    /** Gets the non-static field with the given name of the current class hierarchy. */
    field(name) {
      return this.tryField(name) ?? raise(`couldn't find non-static field ${name} in hierarchy of class ${this.type.name}`);
    }
    /** Gets the non-static method with the given name (and optionally parameter count) of the current class hierarchy. */
    method(name, parameterCount = -1) {
      return this.tryMethod(name, parameterCount) ?? raise(`couldn't find non-static method ${name} in hierarchy of class ${this.type.name}`);
    }
    /** Gets the non-static field with the given name of the current class hierarchy, if it exists. */
    tryField(name) {
      const field = this.type.class.tryField(name);
      if (field?.isStatic) {
        for (const klass of this.type.class.hierarchy()) {
          for (const field2 of klass.fields) {
            if (field2.name == name && !field2.isStatic) {
              return field2.bind(this);
            }
          }
        }
        return void 0;
      }
      return field?.bind(this);
    }
    /** Gets the non-static method with the given name (and optionally parameter count) of the current class hierarchy, if it exists. */
    tryMethod(name, parameterCount = -1) {
      const method = this.type.class.tryMethod(name, parameterCount);
      if (method?.isStatic) {
        for (const klass of this.type.class.hierarchy()) {
          for (const method2 of klass.methods) {
            if (method2.name == name && !method2.isStatic && (parameterCount < 0 || method2.parameterCount == parameterCount)) {
              return method2.bind(this);
            }
          }
        }
        return void 0;
      }
      return method?.bind(this);
    }
    /** */
    toString() {
      const ToString = this.method("ToString", 0);
      return this.isNull() ? "null" : (
        // If ToString is defined within a value type class, we can
        // avoid a boxing operation.
        ToString.class.isValueType ? ToString.invoke().content ?? "null" : this.box().toString() ?? "null"
      );
    }
  }
  Il2Cpp3.ValueType = ValueType;
})(Il2Cpp2 || (Il2Cpp2 = {}));
globalThis.Il2Cpp = Il2Cpp2;

// src/il2cpp-export-names.ts
var CANONICAL_IL2CPP_EXPORTS = [
  "il2cpp_init",
  "il2cpp_init_utf16",
  "il2cpp_shutdown",
  "il2cpp_set_config_dir",
  "il2cpp_set_data_dir",
  "il2cpp_set_temp_dir",
  "il2cpp_set_commandline_arguments",
  "il2cpp_set_commandline_arguments_utf16",
  "il2cpp_set_config_utf16",
  "il2cpp_set_config",
  "il2cpp_set_memory_callbacks",
  "il2cpp_memory_pool_set_region_size",
  "il2cpp_memory_pool_get_region_size",
  "il2cpp_get_corlib",
  "il2cpp_add_internal_call",
  "il2cpp_resolve_icall",
  "il2cpp_alloc",
  "il2cpp_free",
  "il2cpp_array_class_get",
  "il2cpp_array_length",
  "il2cpp_array_get_byte_length",
  "il2cpp_array_new",
  "il2cpp_array_new_specific",
  "il2cpp_array_new_full",
  "il2cpp_bounded_array_class_get",
  "il2cpp_array_element_size",
  "il2cpp_assembly_get_image",
  "il2cpp_class_for_each",
  "il2cpp_class_enum_basetype",
  "il2cpp_class_is_inited",
  "il2cpp_class_is_generic",
  "il2cpp_class_is_inflated",
  "il2cpp_class_is_assignable_from",
  "il2cpp_class_is_subclass_of",
  "il2cpp_class_has_parent",
  "il2cpp_class_from_il2cpp_type",
  "il2cpp_class_from_name",
  "il2cpp_class_from_system_type",
  "il2cpp_class_get_element_class",
  "il2cpp_class_get_events",
  "il2cpp_class_get_fields",
  "il2cpp_class_get_nested_types",
  "il2cpp_class_get_interfaces",
  "il2cpp_class_get_properties",
  "il2cpp_class_get_property_from_name",
  "il2cpp_class_get_field_from_name",
  "il2cpp_class_get_methods",
  "il2cpp_class_get_method_from_name",
  "il2cpp_class_get_name",
  "il2cpp_type_get_name_chunked",
  "il2cpp_class_get_namespace",
  "il2cpp_class_get_parent",
  "il2cpp_class_get_declaring_type",
  "il2cpp_class_instance_size",
  "il2cpp_class_num_fields",
  "il2cpp_class_is_valuetype",
  "il2cpp_class_value_size",
  "il2cpp_class_is_blittable",
  "il2cpp_class_get_flags",
  "il2cpp_class_is_abstract",
  "il2cpp_class_is_interface",
  "il2cpp_class_array_element_size",
  "il2cpp_class_from_type",
  "il2cpp_class_get_type",
  "il2cpp_class_get_type_token",
  "il2cpp_class_has_attribute",
  "il2cpp_class_has_references",
  "il2cpp_class_is_enum",
  "il2cpp_class_get_image",
  "il2cpp_class_get_assemblyname",
  "il2cpp_class_get_rank",
  "il2cpp_class_get_data_size",
  "il2cpp_class_get_static_field_data",
  "il2cpp_stats_dump_to_file",
  "il2cpp_stats_get_value",
  "il2cpp_domain_get",
  "il2cpp_domain_assembly_open",
  "il2cpp_domain_get_assemblies",
  "il2cpp_raise_exception",
  "il2cpp_exception_from_name_msg",
  "il2cpp_get_exception_argument_null",
  "il2cpp_format_exception",
  "il2cpp_format_stack_trace",
  "il2cpp_unhandled_exception",
  "il2cpp_native_stack_trace",
  "il2cpp_field_get_flags",
  "il2cpp_field_get_from_reflection",
  "il2cpp_field_get_name",
  "il2cpp_field_get_parent",
  "il2cpp_field_get_object",
  "il2cpp_field_get_offset",
  "il2cpp_field_get_type",
  "il2cpp_field_get_value",
  "il2cpp_field_get_value_object",
  "il2cpp_field_has_attribute",
  "il2cpp_field_set_value",
  "il2cpp_field_static_get_value",
  "il2cpp_field_static_set_value",
  "il2cpp_field_set_value_object",
  "il2cpp_field_is_literal",
  "il2cpp_gc_collect",
  "il2cpp_gc_collect_a_little",
  "il2cpp_gc_start_incremental_collection",
  "il2cpp_gc_disable",
  "il2cpp_gc_enable",
  "il2cpp_gc_is_disabled",
  "il2cpp_gc_set_mode",
  "il2cpp_gc_get_max_time_slice_ns",
  "il2cpp_gc_set_max_time_slice_ns",
  "il2cpp_gc_is_incremental",
  "il2cpp_gc_get_used_size",
  "il2cpp_gc_get_heap_size",
  "il2cpp_gc_wbarrier_set_field",
  "il2cpp_gc_has_strict_wbarriers",
  "il2cpp_gc_set_external_allocation_tracker",
  "il2cpp_gc_set_external_wbarrier_tracker",
  "il2cpp_gc_foreach_heap",
  "il2cpp_stop_gc_world",
  "il2cpp_start_gc_world",
  "il2cpp_gc_alloc_fixed",
  "il2cpp_gc_free_fixed",
  "il2cpp_gchandle_new",
  "il2cpp_gchandle_new_weakref",
  "il2cpp_gchandle_get_target",
  "il2cpp_gchandle_free",
  "il2cpp_gchandle_foreach_get_target",
  "il2cpp_object_header_size",
  "il2cpp_array_object_header_size",
  "il2cpp_offset_of_array_length_in_array_object_header",
  "il2cpp_offset_of_array_bounds_in_array_object_header",
  "il2cpp_allocation_granularity",
  "il2cpp_unity_liveness_allocate_struct",
  "il2cpp_unity_liveness_calculation_from_root",
  "il2cpp_unity_liveness_calculation_from_statics",
  "il2cpp_unity_liveness_finalize",
  "il2cpp_unity_liveness_free_struct",
  "il2cpp_method_get_return_type",
  "il2cpp_method_get_declaring_type",
  "il2cpp_method_get_name",
  "il2cpp_method_get_from_reflection",
  "il2cpp_method_get_object",
  "il2cpp_method_is_generic",
  "il2cpp_method_is_inflated",
  "il2cpp_method_is_instance",
  "il2cpp_method_get_param_count",
  "il2cpp_method_get_param",
  "il2cpp_method_get_class",
  "il2cpp_method_has_attribute",
  "il2cpp_method_get_flags",
  "il2cpp_method_get_token",
  "il2cpp_method_get_param_name",
  "il2cpp_property_get_flags",
  "il2cpp_property_get_get_method",
  "il2cpp_property_get_set_method",
  "il2cpp_property_get_name",
  "il2cpp_property_get_parent",
  "il2cpp_object_get_class",
  "il2cpp_object_get_size",
  "il2cpp_object_get_virtual_method",
  "il2cpp_object_new",
  "il2cpp_object_unbox",
  "il2cpp_value_box",
  "il2cpp_monitor_enter",
  "il2cpp_monitor_try_enter",
  "il2cpp_monitor_exit",
  "il2cpp_monitor_pulse",
  "il2cpp_monitor_pulse_all",
  "il2cpp_monitor_wait",
  "il2cpp_monitor_try_wait",
  "il2cpp_runtime_invoke",
  "il2cpp_runtime_invoke_convert_args",
  "il2cpp_runtime_class_init",
  "il2cpp_runtime_object_init",
  "il2cpp_runtime_object_init_exception",
  "il2cpp_runtime_unhandled_exception_policy_set",
  "il2cpp_string_length",
  "il2cpp_string_chars",
  "il2cpp_string_new",
  "il2cpp_string_new_len",
  "il2cpp_string_new_utf16",
  "il2cpp_string_new_wrapper",
  "il2cpp_string_intern",
  "il2cpp_string_is_interned",
  "il2cpp_thread_current",
  "il2cpp_thread_attach",
  "il2cpp_thread_detach",
  "il2cpp_is_vm_thread",
  "il2cpp_current_thread_walk_frame_stack",
  "il2cpp_thread_walk_frame_stack",
  "il2cpp_current_thread_get_top_frame",
  "il2cpp_thread_get_top_frame",
  "il2cpp_current_thread_get_frame_at",
  "il2cpp_thread_get_frame_at",
  "il2cpp_current_thread_get_stack_depth",
  "il2cpp_thread_get_stack_depth",
  "il2cpp_override_stack_backtrace",
  "il2cpp_type_get_object",
  "il2cpp_type_get_type",
  "il2cpp_type_get_class_or_element_class",
  "il2cpp_type_get_name",
  "il2cpp_type_is_byref",
  "il2cpp_type_get_attrs",
  "il2cpp_type_equals",
  "il2cpp_type_get_assembly_qualified_name",
  "il2cpp_type_get_reflection_name",
  "il2cpp_type_is_static",
  "il2cpp_type_is_pointer_type",
  "il2cpp_image_get_assembly",
  "il2cpp_image_get_name",
  "il2cpp_image_get_filename",
  "il2cpp_image_get_entry_point",
  "il2cpp_image_get_class_count",
  "il2cpp_image_get_class",
  "il2cpp_capture_memory_snapshot",
  "il2cpp_free_captured_memory_snapshot",
  "il2cpp_set_find_plugin_callback",
  "il2cpp_register_log_callback",
  "il2cpp_debugger_set_agent_options",
  "il2cpp_is_debugger_attached",
  "il2cpp_register_debugger_agent_transport",
  "il2cpp_debug_foreach_method",
  "il2cpp_debug_get_method_info",
  "il2cpp_unity_install_unitytls_interface",
  "il2cpp_custom_attrs_from_class",
  "il2cpp_custom_attrs_from_method",
  "il2cpp_custom_attrs_from_field",
  "il2cpp_custom_attrs_get_attr",
  "il2cpp_custom_attrs_has_attr",
  "il2cpp_custom_attrs_construct",
  "il2cpp_custom_attrs_free",
  "il2cpp_class_set_userdata",
  "il2cpp_class_get_userdata_offset",
  "il2cpp_set_default_thread_affinity",
  "il2cpp_unity_set_android_network_up_state_func"
];

// src/core/log.ts
var PREFIX = "[ACMenu]";
var MAX = 250;
var logBuffer = [];
var logListeners = [];
function push(level, msg) {
  const e = { time: Date.now(), level, msg };
  logBuffer.push(e);
  if (logBuffer.length > MAX)
    logBuffer.shift();
  try {
    const line = `${PREFIX} ${msg}`;
    if (level === "error")
      console.error(line);
    else if (level === "warn")
      console.warn(line);
    else
      console.log(line);
  } catch {
  }
  for (const l of logListeners) {
    try {
      l(e);
    } catch {
    }
  }
}
var log = {
  info: (msg) => push("info", msg),
  ok: (msg) => push("ok", msg),
  warn: (msg) => push("warn", msg),
  error: (msg, err) => push("error", err ? `${msg}: ${describe(err)}` : msg),
  debug: (msg) => push("debug", msg),
  clear: () => {
    logBuffer.length = 0;
  }
};
function describe(err) {
  if (err instanceof Error)
    return `${err.message}${err.stack ? "\n" + err.stack : ""}`;
  return String(err);
}

// src/il2cpp-exports.ts
var MANUAL_EXPORT_MAP = {
  // il2cpp_init: "xxxxxxxxxxx",
};
var strategy = null;
var resolved = /* @__PURE__ */ new Map();
function currentExportStrategy() {
  return strategy ?? "unresolved";
}
function buildExportTable(module) {
  const notes = [];
  const table = /* @__PURE__ */ new Map();
  const exports = module.enumerateExports().filter((e) => e.type === "function");
  const plain = exports.filter((e) => e.name.startsWith("il2cpp_"));
  if (plain.length > 20) {
    for (const e of plain)
      table.set(e.name, e.address);
    notes.push(`module exports ${plain.length} real il2cpp_* symbols`);
    return { strategy: "plain", table, notes };
  }
  const manualNames = Object.keys(MANUAL_EXPORT_MAP);
  if (manualNames.length > 0) {
    let hit = 0;
    for (const name of manualNames) {
      const p = module.findExportByName(MANUAL_EXPORT_MAP[name]);
      if (p) {
        table.set(name, p);
        hit++;
      }
    }
    notes.push(`manual map: ${hit}/${manualNames.length} names found`);
    if (hit > 20)
      return { strategy: "manual", table, notes };
    notes.push("manual map too sparse, falling back to auto");
  }
  const sorted = exports.slice().sort((a, b) => a.address.compare(b.address));
  const n = Math.min(sorted.length, CANONICAL_IL2CPP_EXPORTS.length);
  notes.push(`auto map: module has ${sorted.length} function exports, canonical list has ${CANONICAL_IL2CPP_EXPORTS.length}`);
  if (sorted.length !== CANONICAL_IL2CPP_EXPORTS.length) {
    notes.push("export count differs from canonical list \u2014 mapping is a best-effort guess. If the bridge crashes, generate a map with tools/dump-exports.js");
  }
  for (let i = 0; i < n; i++)
    table.set(CANONICAL_IL2CPP_EXPORTS[i], sorted[i].address);
  for (const name of manualNames) {
    const p = module.findExportByName(MANUAL_EXPORT_MAP[name]);
    if (p)
      table.set(name, p);
  }
  return { strategy: "auto", table, notes };
}
function ensureTable() {
  if (strategy !== null)
    return;
  const mod = Il2Cpp.module;
  const r = buildExportTable(mod);
  strategy = r.strategy;
  resolved = r.table;
  for (const n of r.notes)
    log.info(`exports: ${n}`);
  log.info(`exports: strategy = ${strategy}`);
}
function installExportResolver() {
  const proxy = new Proxy({}, {
    get(_target, prop) {
      if (typeof prop !== "string" || !prop.startsWith("il2cpp_"))
        return void 0;
      return () => {
        ensureTable();
        if (strategy === "plain")
          return Il2Cpp.module.findExportByName(prop);
        return resolved.get(prop) ?? null;
      };
    }
  });
  Il2Cpp.$config.exports = proxy;
}

// src/config.ts
var MENU_INFO = {
  /** Shown in the title bar. Rich text is NOT supported here (keep it short). */
  name: "AC MENU",
  /** Small text next to the name. */
  tagline: "hand menu template",
  version: "1.0.0",
  author: "you",
  /** PlayerPrefs key under which settings are stored. */
  prefsKey: "acmenu.settings.v1"
};
var ALL_BUTTONS = [
  "none",
  "left.primary",
  "left.secondary",
  "left.trigger",
  "left.grip",
  "left.stick",
  "left.menu",
  "right.primary",
  "right.secondary",
  "right.trigger",
  "right.grip",
  "right.stick"
];
var BUTTON_LABELS = {
  "none": "Unbound",
  "left.trigger": "L Trigger",
  "left.grip": "L Grip",
  "left.primary": "X",
  "left.secondary": "Y",
  "left.stick": "L Stick",
  "left.menu": "Menu",
  "right.trigger": "R Trigger",
  "right.grip": "R Grip",
  "right.primary": "A",
  "right.secondary": "B",
  "right.stick": "R Stick"
};
var DEFAULT_SETTINGS = {
  hand: "left",
  scale: 1,
  followMode: "float",
  offset: { x: 0, y: 0.16, z: 0 },
  rotationOffset: { x: 0, y: 0, z: 0 },
  smoothing: 0.35,
  openMode: "toggle",
  openButton: "left.secondary",
  palmThreshold: 0.55,
  pointerMode: "finger",
  fingerOffset: { x: 0, y: -0.01, z: 0.05 },
  clickOnPress: false,
  laserButton: "right.trigger",
  haptics: true,
  sounds: false,
  toggleStyle: "checkbox",
  layout: "sidebar",
  tooltipDelay: 0.6,
  wristHud: true,
  showFps: true,
  showClock: true,
  theme: "Classic"
};
var PANEL = {
  /** landscape "tablet" held in the hand */
  width: 800,
  height: 560,
  /** meters per canvas unit at scale 1.0 → 800u ≈ 0.28 m wide */
  metersPerUnit: 35e-5,
  titleHeight: 40,
  sidebarWidth: 176,
  footerHeight: 28,
  padding: 12
};

// src/core/unity.ts
var imageCache = /* @__PURE__ */ new Map();
var classCache = /* @__PURE__ */ new Map();
function image(assembly) {
  if (imageCache.has(assembly))
    return imageCache.get(assembly);
  let img = null;
  try {
    img = Il2Cpp.domain.tryAssembly(assembly)?.image ?? null;
  } catch {
    img = null;
  }
  imageCache.set(assembly, img);
  return img;
}
function tryCls(assembly, name) {
  const key = `${assembly}|${name}`;
  if (classCache.has(key))
    return classCache.get(key);
  const img = image(assembly);
  let k = null;
  try {
    k = img ? img.tryClass(name) : null;
  } catch {
    k = null;
  }
  classCache.set(key, k);
  return k;
}
function cls(assembly, name) {
  const k = tryCls(assembly, name);
  if (!k)
    throw new Error(`class ${name} not found in ${assembly}`);
  return k;
}
var CORE = "UnityEngine.CoreModule";
var UIM = "UnityEngine.UIModule";
var UGUI = "UnityEngine.UI";
var TEXTR = "UnityEngine.TextRenderingModule";
var XRM = "UnityEngine.XRModule";
var TMP = "Unity.TextMeshPro";
var PHYS = "UnityEngine.PhysicsModule";
var UE = {
  get GameObject() {
    return cls(CORE, "UnityEngine.GameObject");
  },
  get Object() {
    return cls(CORE, "UnityEngine.Object");
  },
  get Component() {
    return cls(CORE, "UnityEngine.Component");
  },
  get Transform() {
    return cls(CORE, "UnityEngine.Transform");
  },
  get RectTransform() {
    return cls(CORE, "UnityEngine.RectTransform");
  },
  get Vector2() {
    return cls(CORE, "UnityEngine.Vector2");
  },
  get Vector3() {
    return cls(CORE, "UnityEngine.Vector3");
  },
  get Vector4() {
    return cls(CORE, "UnityEngine.Vector4");
  },
  get Quaternion() {
    return cls(CORE, "UnityEngine.Quaternion");
  },
  get Color() {
    return cls(CORE, "UnityEngine.Color");
  },
  get Rect() {
    return cls(CORE, "UnityEngine.Rect");
  },
  get Time() {
    return cls(CORE, "UnityEngine.Time");
  },
  get Resources() {
    return cls(CORE, "UnityEngine.Resources");
  },
  get Texture2D() {
    return cls(CORE, "UnityEngine.Texture2D");
  },
  get Sprite() {
    return cls(CORE, "UnityEngine.Sprite");
  },
  get Material() {
    return cls(CORE, "UnityEngine.Material");
  },
  get Shader() {
    return cls(CORE, "UnityEngine.Shader");
  },
  get Camera() {
    return cls(CORE, "UnityEngine.Camera");
  },
  get Application() {
    return cls(CORE, "UnityEngine.Application");
  },
  get PlayerPrefs() {
    return cls(CORE, "UnityEngine.PlayerPrefs");
  },
  get LineRenderer() {
    return cls(CORE, "UnityEngine.LineRenderer");
  },
  get Canvas() {
    return cls(UIM, "UnityEngine.Canvas");
  },
  get CanvasGroup() {
    return cls(UIM, "UnityEngine.CanvasGroup");
  },
  get CanvasScaler() {
    return cls(UGUI, "UnityEngine.UI.CanvasScaler");
  },
  get RectMask2D() {
    return cls(UGUI, "UnityEngine.UI.RectMask2D");
  },
  get Image() {
    return cls(UGUI, "UnityEngine.UI.Image");
  },
  get Text() {
    return cls(UGUI, "UnityEngine.UI.Text");
  },
  get Font() {
    return cls(TEXTR, "UnityEngine.Font");
  },
  get InputDevices() {
    return cls(XRM, "UnityEngine.XR.InputDevices");
  },
  get InputDevice() {
    return cls(XRM, "UnityEngine.XR.InputDevice");
  },
  get CommonUsages() {
    return cls(XRM, "UnityEngine.XR.CommonUsages");
  },
  get Collider() {
    return cls(PHYS, "UnityEngine.Collider");
  },
  // optional
  get TextMeshProUGUI() {
    return tryCls(TMP, "TMPro.TextMeshProUGUI");
  },
  get TMP_Settings() {
    return tryCls(TMP, "TMPro.TMP_Settings");
  },
  get Keyboard() {
    return tryCls("Unity.InputSystem", "UnityEngine.InputSystem.Keyboard");
  }
};
var str = (s) => Il2Cpp.string(s);
function makeStruct(klass, fields) {
  const size = Math.max(klass.valueTypeSize, 4);
  const handle = Memory.alloc(size);
  const vt = new Il2Cpp.ValueType(handle, klass.type);
  for (const k in fields)
    vt.field(k).value = fields[k];
  return vt;
}
var vec2 = (x, y) => makeStruct(UE.Vector2, { x, y });
var vec3 = (v) => makeStruct(UE.Vector3, { x: v.x, y: v.y, z: v.z });
var vec4 = (x, y, z, w) => makeStruct(UE.Vector4, { x, y, z, w });
var quat = (q) => makeStruct(UE.Quaternion, { x: q.x, y: q.y, z: q.z, w: q.w });
var color = (c) => makeStruct(UE.Color, { r: c.r, g: c.g, b: c.b, a: c.a });
var rect = (x, y, w, h) => makeStruct(UE.Rect, { m_XMin: x, m_YMin: y, m_Width: w, m_Height: h });
var readV3 = (vt) => ({ x: vt.field("x").value, y: vt.field("y").value, z: vt.field("z").value });
var readQ = (vt) => ({
  x: vt.field("x").value,
  y: vt.field("y").value,
  z: vt.field("z").value,
  w: vt.field("w").value
});
function isNull(o) {
  return o == null || o.handle.isNull();
}
function normalizeTypeName(n) {
  return n.replace(/`\d+/g, "").replace(/\[/g, "<").replace(/\]/g, ">").replace(/\s+/g, "");
}
function findMethod(klass, name, paramTypes) {
  for (const k of klass.hierarchy({ includeCurrent: true })) {
    for (const m of k.methods) {
      if (m.name !== name || m.parameterCount !== paramTypes.length)
        continue;
      const ps = m.parameters;
      let ok = true;
      for (let i = 0; i < ps.length; i++) {
        const tn = normalizeTypeName(ps[i].type.name);
        const want = normalizeTypeName(paramTypes[i]);
        if (tn === want)
          continue;
        if (want.endsWith("&") && ps[i].type.isByReference && tn.replace(/&$/, "") === want.replace(/&$/, ""))
          continue;
        ok = false;
        break;
      }
      if (ok)
        return m;
    }
  }
  return null;
}
function newGameObject(name, parent) {
  const go = UE.GameObject.new();
  go.method("set_name").invoke(str(name));
  if (parent && !isNull(parent))
    setParent(transformOf(go), parent, false);
  return go;
}
var transformOf = (go) => go.method("get_transform").invoke();
function setParent(t, parent, worldPositionStays = false) {
  t.method("SetParent", 2).invoke(parent, worldPositionStays);
}
function addComponent(go, klass) {
  return go.method("AddComponent", 0).inflate(klass).invoke();
}
function getComponent(go, klass) {
  const c = go.method("GetComponent", 0).inflate(klass).invoke();
  return isNull(c) ? null : c;
}
function destroy(o) {
  if (!o || isNull(o))
    return;
  try {
    UE.Object.method("Destroy", 1).invoke(o);
  } catch (e) {
    log.warn(`destroy failed: ${String(e)}`);
  }
}
var dontDestroyOnLoad = (o) => {
  UE.Object.method("DontDestroyOnLoad", 1).invoke(o);
};
var setActive = (go, active) => {
  go.method("SetActive").invoke(active);
};
var findGameObject = (name) => {
  const go = UE.GameObject.method("Find", 1).invoke(str(name));
  return isNull(go) ? null : go;
};
var HIDE_AND_DONT_SAVE = 61;
var setHideFlags = (o, flags) => {
  o.method("set_hideFlags").invoke(flags);
};
var getPosition = (t) => readV3(t.method("get_position").invoke());
var getRotation = (t) => readQ(t.method("get_rotation").invoke());
var setPosition = (t, v) => {
  t.method("set_position").invoke(vec3(v));
};
var setRotation = (t, q) => {
  t.method("set_rotation").invoke(quat(q));
};
var setLocalScale = (t, v) => {
  t.method("set_localScale").invoke(vec3(v));
};
var setAsFirstSibling = (t) => {
  t.method("SetAsFirstSibling").invoke();
};
var rtSetAnchoredPosition = (rt, x, y) => {
  rt.method("set_anchoredPosition").invoke(vec2(x, y));
};
var rtSetSizeDelta = (rt, w, h) => {
  rt.method("set_sizeDelta").invoke(vec2(w, h));
};
var rtSetPivot = (rt, x, y) => {
  rt.method("set_pivot").invoke(vec2(x, y));
};
function rtSetAnchors(rt, minX, minY, maxX, maxY) {
  rt.method("set_anchorMin").invoke(vec2(minX, minY));
  rt.method("set_anchorMax").invoke(vec2(maxX, maxY));
}
var rtSetLocalEuler = (rt, x, y, z) => {
  rt.method("set_localEulerAngles").invoke(vec3({ x, y, z }));
};
function mainCamera() {
  const c = UE.Camera.method("get_main").invoke();
  return isNull(c) ? null : c;
}
function shaderFind(name) {
  const s = UE.Shader.method("Find", 1).invoke(str(name));
  return isNull(s) ? null : s;
}
function newMaterial(shaderNames) {
  for (const n of shaderNames) {
    const sh = shaderFind(n);
    if (!sh)
      continue;
    try {
      const mat = UE.Material.alloc();
      UE.Material.method("CreateWithShader", 2).invoke(mat, sh);
      return mat;
    } catch (e) {
      log.warn(`material(${n}) failed: ${String(e)}`);
    }
  }
  return null;
}
function builtinFont() {
  for (const name of ["LegacyRuntime.ttf", "Arial.ttf"]) {
    try {
      const f = UE.Resources.method("GetBuiltinResource", 1).inflate(UE.Font).invoke(str(name));
      if (!isNull(f))
        return f;
    } catch {
    }
  }
  return null;
}
var prefsGet = (key, def = "") => UE.PlayerPrefs.method("GetString", 2).invoke(str(key), str(def)).content ?? def;
function prefsSet(key, value) {
  UE.PlayerPrefs.method("SetString", 2).invoke(str(key), str(value));
  UE.PlayerPrefs.method("Save", 0).invoke();
}

// src/core/prefs.ts
var settings = clone(DEFAULT_SETTINGS);
var featureState = {};
var dirty = false;
var lastFlush = 0;
function clone(v) {
  return JSON.parse(JSON.stringify(v));
}
function mergeInto(target, src) {
  for (const k of Object.keys(src)) {
    const s = src[k], t = target[k];
    if (s && typeof s === "object" && !Array.isArray(s) && t && typeof t === "object") {
      mergeInto(t, s);
    } else if (k in target || target === featureState) {
      target[k] = s;
    }
  }
}
function loadSettings() {
  try {
    const raw = prefsGet(MENU_INFO.prefsKey, "");
    if (!raw) {
      log.info("prefs: no saved settings, using defaults");
      return;
    }
    const parsed = JSON.parse(raw);
    if (parsed.settings)
      mergeInto(settings, parsed.settings);
    if (parsed.features)
      mergeInto(featureState, parsed.features);
    log.ok("prefs: settings loaded");
  } catch (e) {
    log.error("prefs: load failed", e);
  }
}
function saveSettings() {
  try {
    prefsSet(MENU_INFO.prefsKey, JSON.stringify({ settings, features: featureState }));
    dirty = false;
    lastFlush = Date.now();
  } catch (e) {
    log.error("prefs: save failed", e);
  }
}
function markDirty() {
  dirty = true;
}
function flushIfDirty() {
  if (dirty && Date.now() - lastFlush > 2e3)
    saveSettings();
}
function resetSettings() {
  const fresh = clone(DEFAULT_SETTINGS);
  for (const k of Object.keys(fresh))
    settings[k] = fresh[k];
  markDirty();
}
function getState(key, def) {
  return key in featureState ? featureState[key] : def;
}
function setState(key, value) {
  featureState[key] = value;
  markDirty();
}

// src/core/input.ts
var emptyHand = () => ({
  valid: false,
  trigger: 0,
  grip: 0,
  triggerBtn: false,
  gripBtn: false,
  primary: false,
  secondary: false,
  stickClick: false,
  menu: false,
  stick: { x: 0, y: 0 }
});
var XR_LEFT = 4;
var XR_RIGHT = 5;
var XRInput = class {
  left = emptyHand();
  right = emptyHand();
  prevLeft = emptyHand();
  prevRight = emptyHand();
  /** true while a desktop keyboard is driving the input (no headset). */
  desktop = false;
  devLeft = null;
  devRight = null;
  nextDeviceRefresh = 0;
  outBool = Memory.alloc(8);
  outFloat = Memory.alloc(8);
  outVec2 = Memory.alloc(16);
  tryBool = null;
  tryFloat = null;
  tryVec2 = null;
  haptic = null;
  usages = {};
  ready = false;
  initFailed = false;
  init() {
    if (this.ready)
      return true;
    if (this.initFailed)
      return false;
    try {
      const dev = UE.InputDevice;
      this.tryBool = findMethod(dev, "TryGetFeatureValue", ["UnityEngine.XR.InputFeatureUsage<System.Boolean>", "System.Boolean&"]);
      this.tryFloat = findMethod(dev, "TryGetFeatureValue", ["UnityEngine.XR.InputFeatureUsage<System.Single>", "System.Single&"]);
      this.tryVec2 = findMethod(dev, "TryGetFeatureValue", ["UnityEngine.XR.InputFeatureUsage<UnityEngine.Vector2>", "UnityEngine.Vector2&"]);
      this.haptic = dev.tryMethod("SendHapticImpulse", 3);
      const cu = UE.CommonUsages;
      for (const n of ["primaryButton", "secondaryButton", "triggerButton", "gripButton", "primary2DAxisClick", "menuButton", "trigger", "grip", "primary2DAxis"]) {
        const f = cu.tryField(n);
        if (f)
          this.usages[n] = f.value;
      }
      if (!this.tryBool)
        throw new Error("TryGetFeatureValue(bool) overload not found");
      this.ready = true;
      log.ok("input: XR InputDevices ready");
      return true;
    } catch (e) {
      this.initFailed = true;
      log.error("input: XR init failed (falling back to desktop keys)", e);
      return false;
    }
  }
  refreshDevices(now) {
    if (now < this.nextDeviceRefresh)
      return;
    this.nextDeviceRefresh = now + 1;
    try {
      const get = UE.InputDevices.method("GetDeviceAtXRNode", 1);
      const l = get.invoke(XR_LEFT), r = get.invoke(XR_RIGHT);
      this.devLeft = l.method("get_isValid").invoke() ? l : null;
      this.devRight = r.method("get_isValid").invoke() ? r : null;
    } catch (e) {
      this.devLeft = this.devRight = null;
    }
  }
  readBool(dev, usage) {
    const u = this.usages[usage];
    if (!u || !this.tryBool)
      return false;
    this.outBool.writeU8(0);
    this.tryBool.bind(dev).invoke(u, this.outBool);
    return this.outBool.readU8() !== 0;
  }
  readFloat(dev, usage) {
    const u = this.usages[usage];
    if (!u || !this.tryFloat)
      return 0;
    this.outFloat.writeFloat(0);
    this.tryFloat.bind(dev).invoke(u, this.outFloat);
    return this.outFloat.readFloat();
  }
  readVec2(dev, usage) {
    const u = this.usages[usage];
    if (!u || !this.tryVec2)
      return { x: 0, y: 0 };
    this.outVec2.writeFloat(0);
    this.outVec2.add(4).writeFloat(0);
    this.tryVec2.bind(dev).invoke(u, this.outVec2);
    return { x: this.outVec2.readFloat(), y: this.outVec2.add(4).readFloat() };
  }
  readHand(dev, into) {
    if (!dev) {
      Object.assign(into, emptyHand());
      return;
    }
    into.valid = true;
    into.primary = this.readBool(dev, "primaryButton");
    into.secondary = this.readBool(dev, "secondaryButton");
    into.triggerBtn = this.readBool(dev, "triggerButton");
    into.gripBtn = this.readBool(dev, "gripButton");
    into.stickClick = this.readBool(dev, "primary2DAxisClick");
    into.menu = this.readBool(dev, "menuButton");
    into.trigger = this.readFloat(dev, "trigger");
    into.grip = this.readFloat(dev, "grip");
    into.stick = this.readVec2(dev, "primary2DAxis");
  }
  /** Poll once per frame. */
  poll(now) {
    const pl = this.prevLeft, pr = this.prevRight;
    this.prevLeft = this.left;
    this.prevRight = this.right;
    this.left = pl;
    this.right = pr;
    if (!this.init()) {
      this.pollDesktop();
      return;
    }
    this.refreshDevices(now);
    try {
      this.readHand(this.devLeft, this.left);
      this.readHand(this.devRight, this.right);
    } catch (e) {
      this.devLeft = this.devRight = null;
      this.nextDeviceRefresh = 0;
    }
    this.desktop = !this.left.valid && !this.right.valid;
    if (this.desktop)
      this.pollDesktop();
  }
  /** Minimal keyboard fallback (new Input System) so the menu can be tested without a headset. */
  pollDesktop() {
    Object.assign(this.left, emptyHand());
    Object.assign(this.right, emptyHand());
    const kb = UE.Keyboard;
    if (!kb)
      return;
    try {
      const cur = kb.method("get_current").invoke();
      if (isNull(cur))
        return;
      const key = (getter2) => cur.method(getter2).invoke().method("get_isPressed").invoke();
      this.left.secondary = key("get_tabKey");
      this.right.triggerBtn = key("get_enterKey") || key("get_spaceKey");
      this.right.trigger = this.right.triggerBtn ? 1 : 0;
      this.right.stick = { x: 0, y: key("get_upArrowKey") ? 1 : key("get_downArrowKey") ? -1 : 0 };
    } catch {
    }
  }
  state(btn, s) {
    switch (btn) {
      case "left.trigger":
        return s.l.triggerBtn || s.l.trigger > 0.6;
      case "left.grip":
        return s.l.gripBtn || s.l.grip > 0.6;
      case "left.primary":
        return s.l.primary;
      case "left.secondary":
        return s.l.secondary;
      case "left.stick":
        return s.l.stickClick;
      case "left.menu":
        return s.l.menu;
      case "right.trigger":
        return s.r.triggerBtn || s.r.trigger > 0.6;
      case "right.grip":
        return s.r.gripBtn || s.r.grip > 0.6;
      case "right.primary":
        return s.r.primary;
      case "right.secondary":
        return s.r.secondary;
      case "right.stick":
        return s.r.stickClick;
      default:
        return false;
    }
  }
  isDown(btn) {
    return this.state(btn, { l: this.left, r: this.right });
  }
  wasDown(btn) {
    return this.state(btn, { l: this.prevLeft, r: this.prevRight });
  }
  wasPressed(btn) {
    return this.isDown(btn) && !this.wasDown(btn);
  }
  wasReleased(btn) {
    return !this.isDown(btn) && this.wasDown(btn);
  }
  /** First button that went down this frame (for key binding UI). */
  anyPressed() {
    const all = [
      "left.primary",
      "left.secondary",
      "left.trigger",
      "left.grip",
      "left.stick",
      "left.menu",
      "right.primary",
      "right.secondary",
      "right.trigger",
      "right.grip",
      "right.stick"
    ];
    for (const b of all)
      if (this.wasPressed(b))
        return b;
    return null;
  }
  stick(hand) {
    return hand === "left" ? this.left.stick : this.right.stick;
  }
  vibrate(hand, amplitude = 0.3, duration = 0.02) {
    const dev = hand === "left" ? this.devLeft : this.devRight;
    if (!dev || !this.haptic)
      return;
    try {
      this.haptic.bind(dev).invoke(0, amplitude, duration);
    } catch {
    }
  }
};

// src/game/ac.ts
var GAME = {
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
      headComponent: "headCollider"
    },
    {
      name: "PlayerController",
      klass: "AnimalCompany.PlayerController",
      instanceField: "_instance",
      left: "_controllerTransformLeft",
      right: "_controllerTransformRight",
      head: "_headTransform",
      headAlt: "_cameraTransform"
    },
    {
      name: "NetPlayer",
      klass: "AnimalCompany.NetPlayer",
      instanceField: "_localPlayer",
      left: "handLeft",
      right: "handRight",
      head: "head"
    }
  ],
  /** Static Camera accessor used as the final head fallback. */
  cameraManager: { klass: "AnimalCompany.CameraManager", getter: "get_main" },
  /** Per-frame hook candidates (class, method, assembly). First that exists wins. */
  frameHooks: [
    { assembly: "AnimalCompany", klass: "AnimalCompany.GorillaLocomotion", method: "LateUpdate" },
    { assembly: "AnimalCompany", klass: "AnimalCompany.GorillaLocomotion", method: "Update" },
    { assembly: "AnimalCompany", klass: "AnimalCompany.PlayerController", method: "Update" },
    { assembly: "UnityEngine.UIModule", klass: "UnityEngine.Canvas", method: "SendWillRenderCanvases" },
    { assembly: "UnityEngine.CoreModule", klass: "UnityEngine.Application", method: "InvokeOnBeforeRender" }
  ],
  /** GameObject names tried when no rig class matched (OVR / XRI defaults). */
  genericNames: {
    left: ["LeftHandAnchor", "LeftControllerAnchor", "LeftHand Controller", "Left Controller", "LeftHand"],
    right: ["RightHandAnchor", "RightControllerAnchor", "RightHand Controller", "Right Controller", "RightHand"],
    head: ["CenterEyeAnchor", "Main Camera", "MainCamera", "Camera"]
  }
};

// src/core/math.ts
var V3_UP = { x: 0, y: 1, z: 0 };
var V3_FWD = { x: 0, y: 0, z: 1 };
var V3_RIGHT = { x: 1, y: 0, z: 0 };
var Q_IDENTITY = { x: 0, y: 0, z: 0, w: 1 };
var add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
var sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
var mul = (a, s) => ({ x: a.x * s, y: a.y * s, z: a.z * s });
var dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
var cross = (a, b) => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x
});
var length = (a) => Math.sqrt(dot(a, a));
function normalize(a) {
  const l = length(a);
  return l > 1e-8 ? mul(a, 1 / l) : { x: 0, y: 0, z: 0 };
}
var lerpV3 = (a, b, t) => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
  z: a.z + (b.z - a.z) * t
});
var lerp = (a, b, t) => a + (b - a) * t;
var clamp = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;
var clamp01 = (v) => clamp(v, 0, 1);
var rad = (deg) => deg * Math.PI / 180;
var damp = (speed, dt) => 1 - Math.exp(-speed * dt);
var qmul = (a, b) => ({
  x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
  y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
  z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
  w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z
});
var qinv = (q) => ({ x: -q.x, y: -q.y, z: -q.z, w: q.w });
function qnormalize(q) {
  const l = Math.sqrt(q.x * q.x + q.y * q.y + q.z * q.z + q.w * q.w);
  return l > 1e-8 ? { x: q.x / l, y: q.y / l, z: q.z / l, w: q.w / l } : { ...Q_IDENTITY };
}
function qrot(q, v) {
  const u = { x: q.x, y: q.y, z: q.z };
  const t = mul(cross(u, v), 2);
  return add(add(v, mul(t, q.w)), cross(u, t));
}
function qaxisAngle(axis, degrees) {
  const a = normalize(axis);
  const h = rad(degrees) / 2;
  const s = Math.sin(h);
  return { x: a.x * s, y: a.y * s, z: a.z * s, w: Math.cos(h) };
}
function qeuler(xDeg, yDeg, zDeg) {
  const qx = qaxisAngle(V3_RIGHT, xDeg);
  const qy = qaxisAngle(V3_UP, yDeg);
  const qz = qaxisAngle(V3_FWD, zDeg);
  return qmul(qmul(qy, qx), qz);
}
function qlook(forward, up = V3_UP) {
  const z = normalize(forward);
  if (length(z) < 1e-6)
    return { ...Q_IDENTITY };
  let x = cross(up, z);
  if (length(x) < 1e-6)
    x = cross({ x: 0, y: 0, z: 1 }, z);
  x = normalize(x);
  const y = cross(z, x);
  const m00 = x.x, m01 = y.x, m02 = z.x;
  const m10 = x.y, m11 = y.y, m12 = z.y;
  const m20 = x.z, m21 = y.z, m22 = z.z;
  const tr = m00 + m11 + m22;
  let q;
  if (tr > 0) {
    const s = Math.sqrt(tr + 1) * 2;
    q = { w: 0.25 * s, x: (m21 - m12) / s, y: (m02 - m20) / s, z: (m10 - m01) / s };
  } else if (m00 > m11 && m00 > m22) {
    const s = Math.sqrt(1 + m00 - m11 - m22) * 2;
    q = { w: (m21 - m12) / s, x: 0.25 * s, y: (m01 + m10) / s, z: (m02 + m20) / s };
  } else if (m11 > m22) {
    const s = Math.sqrt(1 + m11 - m00 - m22) * 2;
    q = { w: (m02 - m20) / s, x: (m01 + m10) / s, y: 0.25 * s, z: (m12 + m21) / s };
  } else {
    const s = Math.sqrt(1 + m22 - m00 - m11) * 2;
    q = { w: (m10 - m01) / s, x: (m02 + m20) / s, y: (m12 + m21) / s, z: 0.25 * s };
  }
  return qnormalize(q);
}
function qnlerp(a, b, t) {
  let d = a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;
  let bb = b;
  if (d < 0) {
    bb = { x: -b.x, y: -b.y, z: -b.z, w: -b.w };
    d = -d;
  }
  return qnormalize({
    x: a.x + (bb.x - a.x) * t,
    y: a.y + (bb.y - a.y) * t,
    z: a.z + (bb.z - a.z) * t,
    w: a.w + (bb.w - a.w) * t
  });
}
var qforward = (q) => qrot(q, V3_FWD);
var easeOutCubic = (t) => 1 - Math.pow(1 - clamp01(t), 3);
function easeOutBack(t) {
  const c1 = 1.70158, c3 = c1 + 1;
  t = clamp01(t);
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}
function hex(h, a = 1) {
  h = h.replace("#", "");
  if (h.length === 3)
    h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h.slice(0, 6), 16);
  const alpha = h.length >= 8 ? parseInt(h.slice(6, 8), 16) / 255 : a;
  return { r: (n >> 16 & 255) / 255, g: (n >> 8 & 255) / 255, b: (n & 255) / 255, a: alpha };
}
function toHex(c) {
  const h = (v) => Math.round(clamp01(v) * 255).toString(16).padStart(2, "0");
  return `#${h(c.r)}${h(c.g)}${h(c.b)}`;
}
var lerpColor = (a, b, t) => ({
  r: lerp(a.r, b.r, t),
  g: lerp(a.g, b.g, t),
  b: lerp(a.b, b.b, t),
  a: lerp(a.a, b.a, t)
});
var withAlpha = (c, a) => ({ r: c.r, g: c.g, b: c.b, a });
var colorEq = (a, b) => Math.abs(a.r - b.r) < 1e-3 && Math.abs(a.g - b.g) < 1e-3 && Math.abs(a.b - b.b) < 1e-3 && Math.abs(a.a - b.a) < 1e-3;
function hsv(h, s, v, a = 1) {
  h = (h % 1 + 1) % 1;
  const i = Math.floor(h * 6), f = h * 6 - i;
  const p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
  switch (i % 6) {
    case 0:
      return { r: v, g: t, b: p, a };
    case 1:
      return { r: q, g: v, b: p, a };
    case 2:
      return { r: p, g: v, b: t, a };
    case 3:
      return { r: p, g: q, b: v, a };
    case 4:
      return { r: t, g: p, b: v, a };
    default:
      return { r: v, g: p, b: q, a };
  }
}
function toHsv(c) {
  const max = Math.max(c.r, c.g, c.b), min = Math.min(c.r, c.g, c.b);
  const d = max - min;
  let h = 0;
  if (d > 1e-6) {
    if (max === c.r)
      h = (c.g - c.b) / d % 6;
    else if (max === c.g)
      h = (c.b - c.r) / d + 2;
    else
      h = (c.r - c.g) / d + 4;
    h /= 6;
    if (h < 0)
      h += 1;
  }
  return { h, s: max > 1e-6 ? d / max : 0, v: max };
}
function hashStr(s, seed = 2166136261) {
  let h = seed >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}
var hashCombine = (a, b) => Math.imul(a ^ b + 2654435769 + (a << 6) + (a >>> 2), 16777619) >>> 0;

// src/core/hands.ts
var Rig = class {
  source = "unresolved";
  t = { head: null, left: null, right: null };
  nextResolve = 0;
  failures = 0;
  get resolved() {
    return !!(this.t.left && this.t.right && this.t.head);
  }
  /** Attempts to (re)resolve transforms. Cheap when already resolved. */
  resolve(now, force = false) {
    if (this.resolved && !force)
      return true;
    if (now < this.nextResolve && !force)
      return false;
    this.nextResolve = now + 2;
    for (const p of GAME.rigs) {
      try {
        const klass = tryCls(GAME.assembly, p.klass);
        if (!klass)
          continue;
        const inst = klass.field(p.instanceField).value;
        if (isNull(inst))
          continue;
        const left = inst.field(p.left).value;
        const right = inst.field(p.right).value;
        let head = null;
        if ("head" in p && p.head) {
          head = inst.field(p.head).value;
          if (isNull(head) && "headAlt" in p && p.headAlt)
            head = inst.field(p.headAlt).value;
        } else if ("headComponent" in p && p.headComponent) {
          const comp = inst.field(p.headComponent).value;
          if (!isNull(comp))
            head = transformOf(comp);
        }
        if (isNull(left) || isNull(right))
          continue;
        this.t.left = left;
        this.t.right = right;
        this.t.head = !isNull(head) ? head : this.headFallback();
        this.source = p.name;
        log.ok(`rig: hands from ${p.name}${this.t.head ? "" : " (no head yet)"}`);
        return this.resolved;
      } catch (e) {
        log.warn(`rig: provider ${p.name} failed: ${String(e)}`);
      }
    }
    const findFirst = (names) => {
      for (const n of names) {
        const go = findGameObject(n);
        if (go)
          return transformOf(go);
      }
      return null;
    };
    const l = findFirst(GAME.genericNames.left), r = findFirst(GAME.genericNames.right);
    if (l && r) {
      this.t.left = l;
      this.t.right = r;
      this.t.head = findFirst(GAME.genericNames.head) ?? this.headFallback();
      this.source = "GameObject names";
      log.ok("rig: hands from generic GameObject names");
      return this.resolved;
    }
    if (++this.failures % 10 === 1)
      log.warn("rig: could not find hand transforms yet (are you in-game?)");
    return false;
  }
  headFallback() {
    try {
      const cm = tryCls(GAME.assembly, GAME.cameraManager.klass);
      if (cm) {
        const cam = cm.method(GAME.cameraManager.getter).invoke();
        if (!isNull(cam))
          return transformOf(cam);
      }
    } catch {
    }
    try {
      const cam = mainCamera();
      if (cam)
        return transformOf(cam);
    } catch {
    }
    return null;
  }
  pose(part) {
    const t = this.t[part];
    if (!t)
      return { pos: { x: 0, y: 0, z: 0 }, rot: { ...Q_IDENTITY }, valid: false };
    try {
      return { pos: getPosition(t), rot: getRotation(t), valid: true };
    } catch {
      this.t[part] = null;
      this.nextResolve = 0;
      return { pos: { x: 0, y: 0, z: 0 }, rot: { ...Q_IDENTITY }, valid: false };
    }
  }
  transform(part) {
    return this.t[part];
  }
  invalidate() {
    this.t = { head: null, left: null, right: null };
    this.nextResolve = 0;
  }
};

// src/core/frame.ts
var callbacks = [];
var hooked = null;
var hookName = "none";
var lastNow = 0;
var errorStreak = 0;
var lastErrorMsg = "";
var ticking = false;
function onFrame(cb) {
  callbacks.push(cb);
}
function frameHookName() {
  return hookName;
}
function tick() {
  if (ticking)
    return;
  ticking = true;
  const now = Date.now() / 1e3;
  let dt = lastNow > 0 ? now - lastNow : 1 / 72;
  if (dt > 0.25)
    dt = 0.25;
  lastNow = now;
  for (const cb of callbacks) {
    try {
      cb(dt, now);
      errorStreak = 0;
    } catch (e) {
      errorStreak++;
      const msg = describe(e);
      if (msg !== lastErrorMsg || errorStreak % 300 === 1) {
        lastErrorMsg = msg;
        log.error(`frame callback failed (${errorStreak}x)`, e);
      }
    }
  }
  ticking = false;
}
function installFrameHook() {
  for (const c of GAME.frameHooks) {
    const klass = tryCls(c.assembly, c.klass);
    if (!klass)
      continue;
    const m = klass.tryMethod(c.method, 0);
    if (!m || m.virtualAddress.isNull())
      continue;
    try {
      const name = c.method;
      m.implementation = function() {
        const r = this.method(name, 0).invoke();
        tick();
        return r;
      };
      hooked = m;
      hookName = `${c.klass}.${c.method}`;
      log.ok(`frame hook installed on ${hookName}`);
      return true;
    } catch (e) {
      log.warn(`could not hook ${c.klass}.${c.method}: ${describe(e)}`);
    }
  }
  log.error("no frame hook candidate matched \u2014 edit GAME.frameHooks in src/game/ac.ts");
  return false;
}
function removeFrameHook() {
  if (hooked) {
    try {
      hooked.revert();
    } catch {
    }
    hooked = null;
    hookName = "none";
  }
  callbacks.length = 0;
}

// src/ui/theme.ts
var METRICS = {
  radius: 6,
  widgetRadius: 3,
  glow: 0,
  fontSize: 16,
  smallFontSize: 13,
  titleSize: 18,
  widgetHeight: 38,
  spacing: 6,
  padding: 12
};
var FANCY = { ...METRICS, radius: 14, widgetRadius: 8, glow: 0.7 };
var Classic = {
  name: "Classic",
  bg: hex("#1e1e1e"),
  surface: hex("#262626"),
  surface2: hex("#333333"),
  border: hex("#414141"),
  shadow: hex("#000000", 0.6),
  titleBg: hex("#2a2a2a"),
  text: hex("#f0f0f0"),
  textDim: hex("#b5b5b5"),
  textMuted: hex("#7c7c7c"),
  accent: hex("#4c8bf5"),
  accent2: hex("#8ab4ff"),
  onAccent: hex("#ffffff"),
  hover: hex("#3a3a3a"),
  active: hex("#474747"),
  success: hex("#4caf50"),
  warning: hex("#e0a83a"),
  danger: hex("#d9534f"),
  info: hex("#5aa9e6"),
  track: hex("#3a3a3a"),
  knob: hex("#d4d4d4"),
  sidebarBg: hex("#232323"),
  sidebarActive: hex("#3d3d3d"),
  sidebarText: hex("#bdbdbd"),
  sidebarActiveText: hex("#ffffff"),
  flat: true,
  ...METRICS
};
var Magenta = {
  ...Classic,
  name: "Magenta",
  bg: hex("#0b0b12"),
  surface: hex("#14141f"),
  surface2: hex("#1c1c2c"),
  border: hex("#2c2c44"),
  titleBg: hex("#c2157f"),
  text: hex("#ffffff"),
  textDim: hex("#c9bfd6"),
  textMuted: hex("#7d6f8f"),
  accent: hex("#ff2fa0"),
  accent2: hex("#ff7ac8"),
  onAccent: hex("#ffffff"),
  hover: hex("#241a33"),
  active: hex("#3a1f44"),
  track: hex("#2c2c44"),
  knob: hex("#ffffff"),
  sidebarBg: hex("#0d0d18"),
  sidebarActive: hex("#ff2fa0"),
  sidebarText: hex("#c9bfd6"),
  sidebarActiveText: hex("#ffffff")
};
var Midnight = {
  name: "Midnight",
  bg: hex("#0b0d14"),
  surface: hex("#131624"),
  surface2: hex("#1a1e30"),
  border: hex("#262c42"),
  shadow: hex("#000000", 0.55),
  titleBg: hex("#0e1120"),
  text: hex("#eaedf7"),
  textDim: hex("#9aa3bf"),
  textMuted: hex("#5c6684"),
  accent: hex("#7c5cff"),
  accent2: hex("#22d3ee"),
  onAccent: hex("#ffffff"),
  hover: hex("#1f2540"),
  active: hex("#2b3358"),
  success: hex("#22c55e"),
  warning: hex("#f59e0b"),
  danger: hex("#ef4444"),
  info: hex("#38bdf8"),
  track: hex("#232941"),
  knob: hex("#ffffff"),
  sidebarBg: hex("#0d101b"),
  sidebarActive: hex("#1a1f36"),
  sidebarText: hex("#8d97b5"),
  sidebarActiveText: hex("#ffffff"),
  flat: false,
  ...FANCY
};
var Aurora = {
  ...Midnight,
  name: "Aurora",
  bg: hex("#07110f"),
  surface: hex("#0d1b18"),
  surface2: hex("#122622"),
  border: hex("#1f3a34"),
  titleBg: hex("#0a1614"),
  text: hex("#e9fbf5"),
  textDim: hex("#8fbdb0"),
  textMuted: hex("#4f7a70"),
  accent: hex("#34d399"),
  accent2: hex("#a3e635"),
  onAccent: hex("#062016"),
  hover: hex("#163129"),
  active: hex("#1f4438"),
  track: hex("#1a3129"),
  sidebarBg: hex("#091512"),
  sidebarActive: hex("#143029"),
  sidebarText: hex("#7fae9f")
};
var Ember = {
  ...Midnight,
  name: "Ember",
  bg: hex("#130b0d"),
  surface: hex("#1e1216"),
  surface2: hex("#29181d"),
  border: hex("#40242b"),
  titleBg: hex("#170d10"),
  text: hex("#fbeff1"),
  textDim: hex("#c4949d"),
  textMuted: hex("#7a5560"),
  accent: hex("#fb7185"),
  accent2: hex("#f59e0b"),
  onAccent: hex("#2b0a10"),
  hover: hex("#33191f"),
  active: hex("#4a232c"),
  track: hex("#33202a"),
  sidebarBg: hex("#100a0c"),
  sidebarActive: hex("#2c171d"),
  sidebarText: hex("#b98a94")
};
var Ocean = {
  ...Midnight,
  name: "Ocean",
  bg: hex("#06101a"),
  surface: hex("#0c1a2a"),
  surface2: hex("#122438"),
  border: hex("#1d3650"),
  titleBg: hex("#081522"),
  text: hex("#e6f2ff"),
  textDim: hex("#8fb3d6"),
  textMuted: hex("#4f6f90"),
  accent: hex("#38bdf8"),
  accent2: hex("#818cf8"),
  onAccent: hex("#03111f"),
  hover: hex("#152d45"),
  active: hex("#1c3f60"),
  track: hex("#17304a"),
  sidebarBg: hex("#070f18"),
  sidebarActive: hex("#12283e"),
  sidebarText: hex("#7ea3c8")
};
var Ghost = {
  ...Midnight,
  name: "Ghost",
  bg: hex("#f2f3f8"),
  surface: hex("#ffffff"),
  surface2: hex("#eef0f6"),
  border: hex("#d6dae6"),
  shadow: hex("#0f172a", 0.25),
  titleBg: hex("#ffffff"),
  text: hex("#12141c"),
  textDim: hex("#5b6478"),
  textMuted: hex("#9aa2b6"),
  accent: hex("#6366f1"),
  accent2: hex("#06b6d4"),
  onAccent: hex("#ffffff"),
  hover: hex("#e6e9f3"),
  active: hex("#d9ddec"),
  track: hex("#dfe3ee"),
  knob: hex("#ffffff"),
  sidebarBg: hex("#e9ebf3"),
  sidebarActive: hex("#ffffff"),
  sidebarText: hex("#5b6478"),
  sidebarActiveText: hex("#12141c")
};
var THEMES = [Classic, Magenta, Midnight, Aurora, Ember, Ocean, Ghost];
var theme = { ...Classic };
var themeVersion = 1;
function bumpTheme() {
  themeVersion++;
}
function applyTheme(name) {
  const t = THEMES.find((x) => x.name.toLowerCase() === name.toLowerCase());
  if (!t)
    return false;
  Object.assign(theme, t);
  bumpTheme();
  return true;
}
function themeNames() {
  return THEMES.map((t) => t.name);
}

// src/ui/sprites.ts
var cache = /* @__PURE__ */ new Map();
function upload(w, h, paint, border) {
  const bytes = new Uint8Array(w * h * 4);
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const a = Math.max(0, Math.min(1, paint(px + 0.5, py + 0.5, w, h)));
      const i = ((h - 1 - py) * w + px) * 4;
      bytes[i] = 255;
      bytes[i + 1] = 255;
      bytes[i + 2] = 255;
      bytes[i + 3] = Math.round(a * 255);
    }
  }
  const tex = UE.Texture2D.alloc();
  const ctor = findMethod(UE.Texture2D, ".ctor", ["System.Int32", "System.Int32", "UnityEngine.TextureFormat", "System.Boolean"]);
  if (!ctor)
    throw new Error("Texture2D ctor not found");
  ctor.bind(tex).invoke(w, h, 4, false);
  tex.method("set_filterMode").invoke(
    1
    /* Bilinear */
  );
  tex.method("set_wrapMode").invoke(
    1
    /* Clamp */
  );
  const mem = Memory.alloc(bytes.length);
  mem.writeByteArray(Array.from(bytes));
  const load = findMethod(UE.Texture2D, "LoadRawTextureData", ["System.IntPtr", "System.Int32"]);
  if (!load)
    throw new Error("LoadRawTextureData(IntPtr,int) not found");
  load.bind(tex).invoke(mem, bytes.length);
  tex.method("Apply", 0).invoke();
  setHideFlags(tex, HIDE_AND_DONT_SAVE);
  const create = findMethod(UE.Sprite, "Create", [
    "UnityEngine.Texture2D",
    "UnityEngine.Rect",
    "UnityEngine.Vector2",
    "System.Single",
    "System.UInt32",
    "UnityEngine.SpriteMeshType",
    "UnityEngine.Vector4"
  ]);
  if (!create)
    throw new Error("Sprite.Create overload not found");
  const sprite = create.invoke(tex, rect(0, 0, w, h), vec2(0.5, 0.5), 100, 0, 1, vec4(border[0], border[1], border[2], border[3]));
  setHideFlags(sprite, HIDE_AND_DONT_SAVE);
  return sprite;
}
function cached(key, make) {
  let s = cache.get(key);
  if (!s) {
    s = make();
    cache.set(key, s);
  }
  return s;
}
function sdRoundBox(x, y, w, h, r, inset = 0) {
  const hx = w / 2 - inset, hy = h / 2 - inset;
  const px = Math.abs(x - w / 2) - (hx - r), py = Math.abs(y - h / 2) - (hy - r);
  const ox = Math.max(px, 0), oy = Math.max(py, 0);
  return Math.sqrt(ox * ox + oy * oy) + Math.min(Math.max(px, py), 0) - r;
}
function segDist(x, y, ax, ay, bx, by) {
  const vx = bx - ax, vy = by - ay, wx = x - ax, wy = y - ay;
  const t = Math.max(0, Math.min(1, (vx * wx + vy * wy) / (vx * vx + vy * vy)));
  const dx = ax + vx * t - x, dy = ay + vy * t - y;
  return Math.sqrt(dx * dx + dy * dy);
}
var Sprites = {
  /** 9-sliced rounded rectangle fill */
  rounded(radius) {
    const r = Math.max(1, Math.round(radius));
    return cached(`rounded:${r}`, () => {
      const s = r * 2 + 3;
      return upload(s, s, (x, y, w, h) => 0.5 - sdRoundBox(x, y, w, h, r), [r + 1, r + 1, r + 1, r + 1]);
    });
  },
  /** 9-sliced rounded outline */
  ring(radius, thickness = 1) {
    const r = Math.max(1, Math.round(radius)), t = Math.max(1, thickness);
    return cached(`ring:${r}:${t}`, () => {
      const s = r * 2 + 3;
      return upload(s, s, (x, y, w, h) => {
        const d = sdRoundBox(x, y, w, h, r);
        const outer = Math.max(0, Math.min(1, 0.5 - d));
        const inner = Math.max(0, Math.min(1, 0.5 - (d + t)));
        return outer - inner;
      }, [r + 1, r + 1, r + 1, r + 1]);
    });
  },
  /** 9-sliced soft drop shadow / glow */
  shadow(radius, blur) {
    const r = Math.max(1, Math.round(radius)), b = Math.max(1, Math.round(blur));
    return cached(`shadow:${r}:${b}`, () => {
      const s = (r + b) * 2 + 3;
      return upload(s, s, (x, y, w, h) => {
        const d = sdRoundBox(x, y, w, h, r, b);
        const a = 1 - Math.max(0, Math.min(1, (d + b * 0.15) / b));
        return a * a;
      }, [r + b + 1, r + b + 1, r + b + 1, r + b + 1]);
    });
  },
  circle(diameter = 32) {
    const d = Math.max(4, Math.round(diameter));
    return cached(`circle:${d}`, () => upload(d, d, (x, y, w, h) => {
      const dx = x - w / 2, dy = y - h / 2;
      return 0.5 - (Math.sqrt(dx * dx + dy * dy) - (w / 2 - 0.5));
    }, [0, 0, 0, 0]));
  },
  /** radial glow (for knobs / status dots) */
  glow(diameter = 48) {
    const d = Math.max(8, Math.round(diameter));
    return cached(`glow:${d}`, () => upload(d, d, (x, y, w, h) => {
      const dx = x - w / 2, dy = y - h / 2;
      const t = Math.sqrt(dx * dx + dy * dy) / (w / 2);
      const a = 1 - Math.min(1, t);
      return a * a * a;
    }, [0, 0, 0, 0]));
  },
  /** alpha 1 → 0 from left to right */
  gradientH() {
    return cached("gradH", () => upload(64, 2, (x, _y, w) => 1 - x / w, [0, 0, 0, 0]));
  },
  /** alpha 1 (top) → 0 (bottom) */
  gradientV() {
    return cached("gradV", () => upload(2, 64, (_x, y, _w, h) => 1 - y / h, [0, 0, 0, 0]));
  },
  /** fade in and out horizontally (separators) */
  fadeLine() {
    return cached("fadeLine", () => upload(96, 2, (x, _y, w) => 1 - Math.abs(x / w - 0.5) * 2, [0, 0, 0, 0]));
  },
  check(size = 28) {
    const s = Math.max(12, Math.round(size));
    return cached(`check:${s}`, () => upload(s, s, (x, y, w, h) => {
      const t = w * 0.11;
      const d = Math.min(segDist(x, y, w * 0.22, h * 0.52, w * 0.42, h * 0.72), segDist(x, y, w * 0.42, h * 0.72, w * 0.8, h * 0.3));
      return 0.5 - (d - t);
    }, [0, 0, 0, 0]));
  },
  /** chevron pointing right (rotate the RectTransform for other directions) */
  chevron(size = 24) {
    const s = Math.max(12, Math.round(size));
    return cached(`chevron:${s}`, () => upload(s, s, (x, y, w, h) => {
      const t = w * 0.08;
      const d = Math.min(segDist(x, y, w * 0.36, h * 0.24, w * 0.64, h * 0.5), segDist(x, y, w * 0.64, h * 0.5, w * 0.36, h * 0.76));
      return 0.5 - (d - t);
    }, [0, 0, 0, 0]));
  },
  /** "x" close glyph */
  cross(size = 24) {
    const s = Math.max(12, Math.round(size));
    return cached(`cross:${s}`, () => upload(s, s, (x, y, w, h) => {
      const t = w * 0.07;
      const d = Math.min(segDist(x, y, w * 0.3, h * 0.3, w * 0.7, h * 0.7), segDist(x, y, w * 0.7, h * 0.3, w * 0.3, h * 0.7));
      return 0.5 - (d - t);
    }, [0, 0, 0, 0]));
  },
  /** plain white square */
  white() {
    return cached("white", () => upload(4, 4, () => 1, [0, 0, 0, 0]));
  },
  /** Pre-builds the sprites the menu uses so the first open does not hitch. */
  warmup(radii) {
    try {
      this.white();
      this.gradientH();
      this.gradientV();
      this.fadeLine();
      this.check();
      this.chevron();
      this.cross();
      this.circle();
      this.glow();
      for (const r of radii) {
        this.rounded(r);
        this.ring(r, 1);
      }
      this.shadow(radii[0] ?? 16, 22);
      log.info(`sprites: ${cache.size} procedural sprites ready`);
    } catch (e) {
      log.error("sprites: warmup failed", e);
    }
  }
};

// src/ui/elements.ts
var textBackend = { kind: "unknown", font: null };
function initTextBackend(preferTmp = true) {
  if (textBackend.kind !== "unknown")
    return;
  if (preferTmp) {
    try {
      const tmpClass = UE.TextMeshProUGUI;
      const settings2 = UE.TMP_Settings;
      if (tmpClass && settings2) {
        const fa = settings2.method("get_defaultFontAsset").invoke();
        if (!isNull(fa)) {
          textBackend.kind = "tmp";
          log.ok("text: TextMeshPro backend");
          return;
        }
        log.warn("text: TMP present but no default font asset, using legacy Text");
      }
    } catch (e) {
      log.warn(`text: TMP probe failed (${String(e)}), using legacy Text`);
    }
  }
  textBackend.kind = "legacy";
  textBackend.font = builtinFont();
  if (!textBackend.font)
    log.warn("text: no builtin font found \u2014 text may be invisible");
  else
    log.ok("text: legacy UnityEngine.UI.Text backend");
}
function createRect(parent, name) {
  const go = newGameObject(name, parent);
  const rt = addComponent(go, UE.RectTransform);
  return { go, rt };
}
function createImage(parent, name, sprite, c, sliced = true) {
  const go = newGameObject(name, parent);
  const img = addComponent(go, UE.Image);
  const rt = getComponent(go, UE.RectTransform);
  img.method("set_raycastTarget").invoke(false);
  const el = { go, rt, img };
  imageSetSprite(el, sprite, sliced);
  imageSetColor(el, c);
  return el;
}
function imageSetSprite(el, sprite, sliced = true) {
  if (el._sprite === sprite)
    return;
  el._sprite = sprite;
  el.img.method("set_sprite").invoke(sprite ?? new Il2Cpp.Object(NULL));
  el.img.method("set_type").invoke(
    sliced && sprite ? 1 : 0
    /* Simple */
  );
}
function imageSetColor(el, c) {
  if (el._color && colorEq(el._color, c))
    return;
  el._color = { ...c };
  el.img.method("set_color").invoke(color(c));
}
function imageSetRotation(el, zDeg) {
  if (el._angle === zDeg)
    return;
  el._angle = zDeg;
  rtSetLocalEuler(el.rt, 0, 0, zDeg);
}
var TMP_ALIGN = {
  "left:top": 257,
  "center:top": 258,
  "right:top": 260,
  "left:middle": 513,
  "center:middle": 514,
  "right:middle": 516,
  "left:bottom": 1025,
  "center:bottom": 1026,
  "right:bottom": 1028
};
var LEGACY_ALIGN = {
  "left:top": 0,
  "center:top": 1,
  "right:top": 2,
  "left:middle": 3,
  "center:middle": 4,
  "right:middle": 5,
  "left:bottom": 6,
  "center:bottom": 7,
  "right:bottom": 8
};
function createText(parent, name, text, size, c, h = "left", v = "middle", bold = false) {
  if (textBackend.kind === "unknown")
    initTextBackend();
  const go = newGameObject(name, parent);
  let txt;
  let kind;
  if (textBackend.kind === "tmp" && UE.TextMeshProUGUI) {
    txt = addComponent(go, UE.TextMeshProUGUI);
    kind = "tmp";
    txt.method("set_raycastTarget").invoke(false);
    txt.method("set_richText").invoke(true);
    txt.tryMethod("set_enableAutoSizing")?.invoke(false);
    txt.tryMethod("set_margin")?.invoke(vec4(0, 0, 0, 0));
  } else {
    txt = addComponent(go, UE.Text);
    kind = "legacy";
    txt.method("set_raycastTarget").invoke(false);
    txt.method("set_supportRichText").invoke(true);
    if (textBackend.font)
      txt.method("set_font").invoke(textBackend.font);
  }
  const rt = getComponent(go, UE.RectTransform);
  const el = { go, rt, txt, kind };
  textSetWrap(el, false);
  textSetSize(el, size);
  textSetColor(el, c);
  textSetAlign(el, h, v);
  textSetBold(el, bold);
  textSet(el, text);
  return el;
}
function textSet(el, s) {
  if (el._text === s)
    return;
  el._text = s;
  el.txt.method("set_text").invoke(str(s));
}
function textSetColor(el, c) {
  if (el._color && colorEq(el._color, c))
    return;
  el._color = { ...c };
  el.txt.method("set_color").invoke(color(c));
}
function textSetSize(el, size) {
  if (el._size === size)
    return;
  el._size = size;
  if (el.kind === "tmp")
    el.txt.method("set_fontSize").invoke(size);
  else
    el.txt.method("set_fontSize").invoke(Math.round(size));
}
function textSetBold(el, bold) {
  if (el._bold === bold)
    return;
  el._bold = bold;
  el.txt.method("set_fontStyle").invoke(bold ? 1 : 0);
}
function textSetAlign(el, h, v) {
  const key = `${h}:${v}`;
  if (el._align === key)
    return;
  el._align = key;
  el.txt.method("set_alignment").invoke(el.kind === "tmp" ? TMP_ALIGN[key] : LEGACY_ALIGN[key]);
}
function textSetWrap(el, wrap) {
  if (el._wrap === wrap)
    return;
  el._wrap = wrap;
  if (el.kind === "tmp") {
    const m = el.txt.tryMethod("set_textWrappingMode") ?? null;
    if (m)
      m.invoke(
        wrap ? 1 : 0
        /* NoWrap */
      );
    else
      el.txt.tryMethod("set_enableWordWrapping")?.invoke(wrap);
    el.txt.tryMethod("set_overflowMode")?.invoke(
      wrap ? 0 : 1
      /* Ellipsis */
    );
  } else {
    el.txt.method("set_horizontalOverflow").invoke(wrap ? 0 : 1);
    el.txt.method("set_verticalOverflow").invoke(1);
  }
}
function textPreferredHeight(el) {
  try {
    return el.txt.method("get_preferredHeight").invoke();
  } catch {
    return 0;
  }
}
function addCanvasGroup(go) {
  const cg = addComponent(go, UE.CanvasGroup);
  cg.method("set_blocksRaycasts").invoke(false);
  cg.method("set_interactable").invoke(false);
  return { cg };
}
function groupSetAlpha(g, a) {
  const v = Math.round(a * 100) / 100;
  if (g._alpha === v)
    return;
  g._alpha = v;
  g.cg.method("set_alpha").invoke(v);
}
function addMask(go) {
  addComponent(go, UE.RectMask2D);
}
function initTopLeft(el, center = false) {
  if (center) {
    rtSetAnchors(el.rt, 0, 1, 0, 1);
    rtSetPivot(el.rt, 0.5, 0.5);
  } else {
    rtSetAnchors(el.rt, 0, 1, 0, 1);
    rtSetPivot(el.rt, 0, 1);
  }
  el._center = center;
  el._px = el._py = el._pw = el._ph = void 0;
}
function place(el, x, y, w, h) {
  x = Math.round(x * 2) / 2;
  y = Math.round(y * 2) / 2;
  w = Math.round(w * 2) / 2;
  h = Math.round(h * 2) / 2;
  if (el._center) {
    const cx = x + w / 2, cy = y + h / 2;
    if (el._px !== cx || el._py !== cy) {
      rtSetAnchoredPosition(el.rt, cx, -cy);
      el._px = cx;
      el._py = cy;
    }
  } else if (el._px !== x || el._py !== y) {
    rtSetAnchoredPosition(el.rt, x, -y);
    el._px = x;
    el._py = y;
  }
  if (el._pw !== w || el._ph !== h) {
    rtSetSizeDelta(el.rt, w, h);
    el._pw = w;
    el._ph = h;
  }
}
function setVisible(el, v) {
  if (el._vis === v)
    return;
  el._vis = v;
  setActive(el.go, v);
}

// src/ui/gui.ts
var newScroll = () => ({
  scroll: 0,
  velocity: 0,
  contentH: 0,
  viewH: 0,
  dragging: false,
  pressed: false,
  pressY: 0,
  scrollAtPress: 0,
  lastY: 0
});
var Widget = class {
  id;
  kind;
  layerId;
  root;
  parts = {};
  lastFrame = -1;
  shown = true;
  /** true only during the frame the widget was created */
  created = true;
  hoverT = 0;
  pressT = 0;
  anim = 0;
  zoneHover = -1;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  state = {};
  constructor(id, kind, layerId, root) {
    this.id = id;
    this.kind = kind;
    this.layerId = layerId;
    this.root = root;
  }
};
var lineHeight = (size) => Math.round(size * 1.5);
var estWidth = (text, size) => Math.round(text.length * size * 0.56);
var approach = (cur, target, k) => Math.abs(target - cur) < 2e-3 ? target : cur + (target - cur) * clamp01(k);
var TRANSPARENT = { r: 0, g: 0, b: 0, a: 0 };
var Gui = class _Gui {
  host;
  frame = 0;
  dt = 1 / 72;
  now = 0;
  ptr = { valid: false, x: 0, y: 0, down: false, pressed: false, released: false, depth: 0 };
  /** When true, only layers drawn with `overlay = true` receive input (modal). */
  pointerBlocked = false;
  keyboard = { open: false, targetId: 0, buffer: "", title: "", shift: false, symbols: false, changed: false, closedFrame: -1 };
  tooltipReq = null;
  widgets = /* @__PURE__ */ new Map();
  layers = [];
  L;
  overlayPass = false;
  activeId = 0;
  activeZone = 0;
  activeCaptured = false;
  hoveredId = 0;
  hoverStart = 0;
  hoverThisFrame = 0;
  idStack = [];
  openDropdown = 0;
  capturing = 0;
  dup = 0;
  constructor(host) {
    this.host = host;
  }
  // ── frame ──────────────────────────────────────────────────────────────
  beginFrame(ptr2, dt, now) {
    this.frame++;
    this.dt = dt;
    this.now = now;
    this.ptr = ptr2;
    this.hoverThisFrame = 0;
    this.tooltipReq = null;
    this.dup = 0;
    this.layers.length = 0;
    if (this.keyboard.changed && this.keyboard.closedFrame >= 0 && this.frame - this.keyboard.closedFrame > 2)
      this.keyboard.changed = false;
  }
  endFrame() {
    for (const w of this.widgets.values()) {
      if (w.lastFrame !== this.frame && w.shown) {
        setActive(w.root.go, false);
        w.shown = false;
      }
    }
    if (!this.ptr.down) {
      this.activeId = 0;
      this.activeCaptured = false;
    }
    if (this.hoverThisFrame === 0)
      this.hoveredId = 0;
  }
  /** Destroys every pooled widget (page reload / unload). */
  reset() {
    for (const w of this.widgets.values())
      destroy(w.root.go);
    this.widgets.clear();
  }
  // ── layers ─────────────────────────────────────────────────────────────
  /**
   * Starts drawing into `container` (a Transform). x0/y0 = container's top-left in
   * panel space, `clip` = visible rect in panel space, `scroll` = optional scroll state.
   */
  beginLayer(id, container, x0, y0, width, clip, scroll = null, overlay = false) {
    const idBase = hashStr(id);
    let sy = 0;
    if (scroll) {
      this.updateScroll(scroll, clip);
      sy = scroll.scroll;
      if (scroll._applied !== Math.round(sy * 2) / 2) {
        scroll._applied = Math.round(sy * 2) / 2;
        container.method("set_anchoredPosition").invoke(vec2(0, scroll._applied));
      }
    }
    const L = {
      id: idBase,
      container,
      x0,
      y0: y0 - sy,
      width,
      clip,
      scroll,
      indent: 0,
      rightEdge: width,
      cursorX: 0,
      cursorY: 0,
      lineH: 0,
      sameLine: false,
      nextW: null,
      maxY: 0,
      cols: null,
      cards: [],
      lastItem: { x: 0, y: 0, w: 0, h: 0 },
      lastId: 0,
      idBase
    };
    this.layers.push(L);
    this.L = L;
    this.overlayPass = overlay;
  }
  /** Ends the layer; returns the content height. */
  endLayer() {
    const L = this.L;
    this.flushLine();
    const h = Math.max(L.maxY, L.cursorY);
    if (L.scroll)
      L.scroll.contentH = h;
    this.layers.pop();
    this.L = this.layers[this.layers.length - 1];
    this.overlayPass = false;
    return h;
  }
  updateScroll(s, clip) {
    const p = this.ptr, dt = this.dt;
    s.viewH = clip.h;
    const inClip = p.valid && this.pointIn(p.x, p.y, clip) && (!this.pointerBlocked || this.overlayPass);
    if (p.pressed && inClip) {
      s.pressed = true;
      s.dragging = false;
      s.pressY = p.y;
      s.scrollAtPress = s.scroll;
      s.lastY = p.y;
      s.velocity = 0;
    }
    if (s.pressed && p.down) {
      if (!this.activeCaptured) {
        const dy = p.y - s.pressY;
        if (!s.dragging && Math.abs(dy) > 10) {
          s.dragging = true;
          this.activeId = 0;
        }
        if (s.dragging) {
          s.scroll = s.scrollAtPress - dy;
          if (dt > 0)
            s.velocity = lerp(s.velocity, -(p.y - s.lastY) / dt, 0.5);
        }
      }
      s.lastY = p.y;
    }
    if (!p.down) {
      s.pressed = false;
      s.dragging = false;
    }
    if (!s.pressed && Math.abs(s.velocity) > 2) {
      s.scroll += s.velocity * dt;
      s.velocity *= Math.exp(-dt * 6);
    } else if (!s.pressed)
      s.velocity = 0;
    const max = Math.max(0, s.contentH - s.viewH);
    if (s.scroll < 0) {
      s.scroll = 0;
      s.velocity = 0;
    }
    if (s.scroll > max) {
      s.scroll = max;
      s.velocity = 0;
    }
  }
  scrollBy(s, dy) {
    s.scroll += dy;
    s.velocity = 0;
  }
  // ── layout ─────────────────────────────────────────────────────────────
  get contentWidth() {
    return this.L.rightEdge - this.L.indent;
  }
  get cursorY() {
    return this.L.cursorY;
  }
  flushLine() {
    const L = this.L;
    if (L.lineH > 0) {
      L.cursorY += L.lineH + theme.spacing;
      L.lineH = 0;
    }
    L.cursorX = L.indent;
    L.sameLine = false;
  }
  /** Reserves a rect for the next item. */
  allocate(h, w) {
    const L = this.L;
    if (!L.sameLine) {
      if (L.lineH > 0)
        L.cursorY += L.lineH + theme.spacing;
      L.cursorX = L.indent;
      L.lineH = 0;
    }
    const avail = Math.max(10, L.rightEdge - L.cursorX);
    const width = Math.min(avail, w ?? L.nextW ?? avail);
    const r = { x: L.cursorX, y: L.cursorY, w: width, h };
    L.cursorX += width + theme.spacing;
    L.lineH = Math.max(L.lineH, h);
    L.sameLine = false;
    L.nextW = null;
    L.maxY = Math.max(L.maxY, r.y + r.h);
    L.lastItem = r;
    return r;
  }
  /** Next item continues on the current line. */
  sameLine() {
    this.L.sameLine = true;
  }
  /** Width of the next item (default = remaining width). */
  setNextWidth(w) {
    this.L.nextW = w;
  }
  spacing(h = theme.spacing) {
    this.flushLine();
    this.L.cursorY += h;
  }
  indent(px = 16) {
    this.flushLine();
    this.L.indent += px;
    this.L.cursorX = this.L.indent;
  }
  unindent(px = 16) {
    this.flushLine();
    this.L.indent = Math.max(0, this.L.indent - px);
    this.L.cursorX = this.L.indent;
  }
  beginColumns(n, gap = theme.spacing) {
    this.flushLine();
    const L = this.L;
    const colW = (L.rightEdge - L.indent - gap * (n - 1)) / n;
    L.cols = { n, gap, i: 0, startY: L.cursorY, maxY: L.cursorY, colW, baseIndent: L.indent, baseRight: L.rightEdge };
    L.rightEdge = L.indent + colW;
    L.cursorX = L.indent;
  }
  nextColumn() {
    const L = this.L, c = L.cols;
    if (!c)
      return;
    this.flushLine();
    c.maxY = Math.max(c.maxY, L.cursorY);
    c.i = Math.min(c.n - 1, c.i + 1);
    L.indent = c.baseIndent + c.i * (c.colW + c.gap);
    L.rightEdge = L.indent + c.colW;
    L.cursorX = L.indent;
    L.cursorY = c.startY;
    L.lineH = 0;
  }
  endColumns() {
    const L = this.L, c = L.cols;
    if (!c)
      return;
    this.flushLine();
    c.maxY = Math.max(c.maxY, L.cursorY);
    L.indent = c.baseIndent;
    L.rightEdge = c.baseRight;
    L.cursorX = L.indent;
    L.cursorY = c.maxY;
    L.lineH = 0;
    L.cols = null;
  }
  pushId(id) {
    this.idStack.push(typeof id === "number" ? id : hashStr(id));
  }
  popId() {
    this.idStack.pop();
  }
  // ── ids & pool ─────────────────────────────────────────────────────────
  makeId(label) {
    let h = hashCombine(this.L.idBase, hashStr(label));
    for (const s of this.idStack)
      h = hashCombine(h, s);
    return h;
  }
  static display(label) {
    const i = label.indexOf("##");
    return i >= 0 ? label.substring(0, i) : label;
  }
  get(label, kind) {
    let id = this.makeId(label);
    let w = this.widgets.get(id);
    if (w && w.lastFrame === this.frame) {
      id = hashCombine(id, ++this.dup);
      w = this.widgets.get(id);
    }
    if (w && w.kind !== kind) {
      destroy(w.root.go);
      this.widgets.delete(id);
      w = void 0;
    }
    if (!w) {
      const root = createRect(this.L.container, kind);
      initTopLeft(root);
      w = new Widget(id, kind, this.L.id, root);
      this.widgets.set(id, w);
    } else {
      w.created = false;
      if (w.layerId !== this.L.id) {
        setParent(transformOf(w.root.go), this.L.container, false);
        w.layerId = this.L.id;
      }
    }
    if (!w.shown) {
      setActive(w.root.go, true);
      w.shown = true;
    }
    w.lastFrame = this.frame;
    this.L.lastId = id;
    return w;
  }
  img(w, name, sprite, c, sliced = true, center = false) {
    let p = w.parts[name];
    if (!p) {
      p = createImage(transformOf(w.root.go), name, sprite, c, sliced);
      initTopLeft(p, center);
      w.parts[name] = p;
    }
    return p;
  }
  txt(w, name, size, c, h = "left", v = "middle", bold = false) {
    let p = w.parts[name];
    if (!p) {
      p = createText(transformOf(w.root.go), name, "", size, c, h, v, bold);
      initTopLeft(p);
      w.parts[name] = p;
    }
    return p;
  }
  hide(w, name) {
    const p = w.parts[name];
    if (p)
      setVisible(p, false);
  }
  show(p) {
    setVisible(p, true);
  }
  // ── interaction ────────────────────────────────────────────────────────
  pointIn(x, y, r) {
    return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  }
  /** Pointer position in the current layer's coordinates. */
  layerPointer() {
    return { x: this.ptr.x - this.L.x0, y: this.ptr.y - this.L.y0 };
  }
  interact(w, r, zone = 0, capture = false, disabled = false) {
    const L = this.L, p = this.ptr;
    const lx = p.x - L.x0, ly = p.y - L.y0;
    const allowed = p.valid && !disabled && this.pointIn(p.x, p.y, L.clip) && (!this.pointerBlocked || this.overlayPass);
    const inside = allowed && lx >= r.x && lx <= r.x + r.w && ly >= r.y && ly <= r.y + r.h;
    const scrollDrag = L.scroll?.dragging ?? false;
    const isActive = this.activeId === w.id && this.activeZone === zone;
    const hovered = inside && !scrollDrag && (this.activeId === 0 || isActive);
    let pressed = false, clicked = false, released = false;
    if (hovered && p.pressed && this.activeId === 0) {
      this.activeId = w.id;
      this.activeZone = zone;
      this.activeCaptured = capture;
      pressed = true;
    }
    const nowActive = this.activeId === w.id && this.activeZone === zone;
    const held = nowActive && p.down;
    if (nowActive && p.released) {
      released = true;
      clicked = inside && !scrollDrag;
    }
    if (this.host.settings.clickOnPress)
      clicked = pressed;
    if (hovered) {
      this.hoverThisFrame = w.id;
      if (this.hoveredId !== w.id || w.zoneHover !== zone) {
        this.hoveredId = w.id;
        w.zoneHover = zone;
        this.hoverStart = this.now;
        this.host.haptic("hover");
      }
    }
    if (clicked)
      this.host.haptic("click");
    if (zone === 0) {
      w.hoverT = approach(w.hoverT, hovered || held ? 1 : 0, this.dt * 16);
      w.pressT = approach(w.pressT, held ? 1 : 0, this.dt * 20);
    }
    return { hovered, pressed, held, released, clicked };
  }
  /** True if the last item is hovered. */
  isItemHovered() {
    return this.hoveredId === this.L.lastId && this.hoveredId !== 0;
  }
  /** Tooltip for the last item (shows after `settings.tooltipDelay`). */
  tooltip(text) {
    if (!this.isItemHovered())
      return;
    if (this.now - this.hoverStart < this.host.settings.tooltipDelay)
      return;
    const r = this.L.lastItem;
    this.tooltipReq = { text, rect: { x: r.x + this.L.x0, y: r.y + this.L.y0, w: r.w, h: r.h } };
  }
  // ── widgets: text ──────────────────────────────────────────────────────
  label(text, opts = {}) {
    const size = opts.size ?? theme.fontSize;
    const w = this.get(text + "##lbl" + (this.L.cursorY | 0), "label");
    const t = this.txt(w, "t", size, theme.text);
    textSetSize(t, size);
    textSetBold(t, !!opts.bold);
    textSetAlign(t, opts.align ?? "left", "middle");
    textSetColor(t, opts.color ?? theme.text);
    textSetWrap(t, !!opts.wrap);
    let h = opts.height ?? lineHeight(size);
    if (opts.wrap) {
      const width = this.L.nextW ?? this.L.rightEdge - (this.L.sameLine ? this.L.cursorX : this.L.indent);
      if (w.state.text !== text || w.state.width !== width) {
        place(w.root, 0, 0, width, h);
        place(t, 0, 0, width, h);
        textSet(t, text);
        h = Math.max(h, Math.ceil(textPreferredHeight(t)) + 2);
        w.state = { text, width, h };
      } else
        h = w.state.h;
    }
    const r = this.allocate(h);
    place(w.root, r.x, r.y, r.w, r.h);
    place(t, 0, 0, r.w, r.h);
    textSet(t, text);
  }
  text(text, color2 = theme.text) {
    this.label(text, { color: color2 });
  }
  textDim(text) {
    this.label(text, { color: theme.textDim });
  }
  textWrapped(text, color2 = theme.textDim) {
    this.label(text, { color: color2, wrap: true });
  }
  header(text) {
    const w = this.get(text + "##hdr", "header");
    const r = this.allocate(lineHeight(theme.titleSize) + 6);
    place(w.root, r.x, r.y, r.w, r.h);
    const t = this.txt(w, "t", theme.titleSize, theme.text, "left", "middle", true);
    place(t, 0, 0, r.w, r.h - 6);
    textSet(t, GuiText(text));
    textSetColor(t, theme.text);
    textSetSize(t, theme.titleSize);
    const line = this.img(w, "line", Sprites.gradientH(), theme.accent, false);
    imageSetSprite(line, theme.flat ? Sprites.white() : Sprites.gradientH(), false);
    if (theme.flat) {
      place(line, 0, r.h - 2, r.w, 1);
      imageSetColor(line, theme.border);
    } else {
      place(line, 0, r.h - 3, Math.min(r.w, 120), 2);
      imageSetColor(line, theme.accent);
    }
  }
  separator(label) {
    const w = this.get((label ?? "") + "##sep" + (this.L.cursorY | 0), "separator");
    const r = this.allocate(label ? 20 : 10);
    place(w.root, r.x, r.y, r.w, r.h);
    const line = this.img(w, "line", Sprites.fadeLine(), theme.border, false);
    if (label) {
      const t = this.txt(w, "t", theme.smallFontSize, theme.textMuted, "left", "middle", true);
      const tw = estWidth(label, theme.smallFontSize) + 6;
      place(t, 0, 0, tw, r.h);
      textSet(t, label.toUpperCase());
      textSetColor(t, theme.textMuted);
      place(line, tw + 4, r.h / 2, Math.max(0, r.w - tw - 4), 1);
    } else {
      place(line, 0, r.h / 2, r.w, 1);
    }
    imageSetColor(line, withAlpha(theme.border, 0.9));
  }
  keyValue(key, value, valueColor = theme.text) {
    const w = this.get(key + "##kv", "kv");
    const r = this.allocate(24);
    place(w.root, r.x, r.y, r.w, r.h);
    const k = this.txt(w, "k", theme.smallFontSize + 1, theme.textDim);
    const v = this.txt(w, "v", theme.smallFontSize + 1, theme.text, "right");
    place(k, 0, 0, r.w * 0.5, r.h);
    textSet(k, key);
    textSetColor(k, theme.textDim);
    place(v, r.w * 0.45, 0, r.w * 0.55, r.h);
    textSet(v, value);
    textSetColor(v, valueColor);
  }
  badge(text, color2 = theme.accent) {
    const w = this.get(text + "##badge", "badge");
    const width = estWidth(text, theme.smallFontSize) + 18;
    const r = this.allocate(22, width);
    place(w.root, r.x, r.y, r.w, r.h);
    const bg = this.img(w, "bg", Sprites.rounded(11), withAlpha(color2, 0.18));
    place(bg, 0, 0, r.w, r.h);
    imageSetColor(bg, withAlpha(color2, 0.18));
    const t = this.txt(w, "t", theme.smallFontSize, color2, "center", "middle", true);
    place(t, 0, 0, r.w, r.h);
    textSet(t, text);
    textSetColor(t, color2);
  }
  // ── widgets: buttons ───────────────────────────────────────────────────
  button(label, opts = {}) {
    const w = this.get(label, "button");
    const h = opts.height ?? (opts.small ? 28 : theme.widgetHeight);
    const r = this.allocate(h, opts.width);
    place(w.root, r.x, r.y, r.w, r.h);
    const it = this.interact(w, { x: 0, y: 0, w: r.w, h: r.h }, 0, false, opts.disabled);
    const v = opts.variant ?? "default";
    let base, hover, textC, borderC;
    switch (v) {
      case "primary":
        base = theme.accent;
        hover = lerpColor(theme.accent, { r: 1, g: 1, b: 1, a: 1 }, 0.15);
        textC = theme.onAccent;
        borderC = withAlpha(theme.accent, 0);
        break;
      case "accent2":
        base = theme.accent2;
        hover = lerpColor(theme.accent2, { r: 1, g: 1, b: 1, a: 1 }, 0.15);
        textC = theme.onAccent;
        borderC = withAlpha(theme.accent2, 0);
        break;
      case "danger":
        base = withAlpha(theme.danger, 0.16);
        hover = withAlpha(theme.danger, 0.35);
        textC = theme.danger;
        borderC = withAlpha(theme.danger, 0.5);
        break;
      case "ghost":
        base = TRANSPARENT;
        hover = theme.hover;
        textC = theme.textDim;
        borderC = TRANSPARENT;
        break;
      default:
        base = theme.surface2;
        hover = theme.hover;
        textC = theme.text;
        borderC = theme.border;
    }
    let bgc = lerpColor(base, hover, w.hoverT);
    bgc = lerpColor(bgc, theme.active, w.pressT * 0.6);
    if (opts.disabled) {
      bgc = withAlpha(bgc, 0.4);
      textC = withAlpha(textC, 0.5);
    }
    const rad2 = theme.widgetRadius;
    const fancy = (v === "primary" || v === "accent2") && !theme.flat && theme.glow > 0;
    if (fancy) {
      const glow = this.img(w, "glow", Sprites.shadow(rad2, 10), withAlpha(base, 0.35));
      this.show(glow);
      place(glow, -8, -6, r.w + 16, r.h + 16);
      imageSetColor(glow, withAlpha(base, 0.25 * theme.glow + 0.2 * w.hoverT));
    } else
      this.hide(w, "glow");
    const bg = this.img(w, "bg", Sprites.rounded(rad2), bgc);
    place(bg, 0, 0, r.w, r.h);
    imageSetColor(bg, bgc);
    if (fancy) {
      const sheen = this.img(w, "sheen", Sprites.gradientV(), withAlpha({ r: 1, g: 1, b: 1, a: 1 }, 0.12), false);
      this.show(sheen);
      place(sheen, 2, 1, r.w - 4, r.h / 2);
      imageSetColor(sheen, withAlpha({ r: 1, g: 1, b: 1, a: 1 }, 0.12));
    } else
      this.hide(w, "sheen");
    const border = this.img(w, "border", Sprites.ring(rad2, 1), borderC);
    place(border, 0, 0, r.w, r.h);
    imageSetColor(border, lerpColor(borderC, theme.accent, v === "default" ? w.hoverT * 0.6 : 0));
    const t = this.txt(w, "t", opts.small ? theme.smallFontSize + 1 : theme.fontSize, textC, "center", "middle", true);
    place(t, 6, 0, r.w - 12, r.h);
    textSet(t, _Gui.display(label));
    textSetColor(t, textC);
    return it.clicked && !opts.disabled;
  }
  /** A button that stays highlighted while `value` is true. Returns the new value. */
  toggleButton(label, value, onChange, opts = {}) {
    const w = this.get(label, "tbutton");
    const r = this.allocate(opts.height ?? theme.widgetHeight, opts.width);
    place(w.root, r.x, r.y, r.w, r.h);
    const it = this.interact(w, { x: 0, y: 0, w: r.w, h: r.h });
    w.anim = approach(w.anim, value ? 1 : 0, this.dt * 14);
    const base = lerpColor(theme.surface2, withAlpha(theme.accent, 0.9), w.anim);
    const bgc = lerpColor(base, lerpColor(theme.hover, theme.accent, w.anim), w.hoverT);
    const bg = this.img(w, "bg", Sprites.rounded(theme.widgetRadius), bgc);
    place(bg, 0, 0, r.w, r.h);
    imageSetColor(bg, bgc);
    const border = this.img(w, "border", Sprites.ring(theme.widgetRadius, 1), theme.border);
    place(border, 0, 0, r.w, r.h);
    imageSetColor(border, lerpColor(theme.border, theme.accent, w.anim));
    const tc = lerpColor(theme.text, theme.onAccent, w.anim);
    const t = this.txt(w, "t", theme.fontSize, tc, "center", "middle", true);
    place(t, 6, 0, r.w - 12, r.h);
    textSet(t, _Gui.display(label));
    textSetColor(t, tc);
    if (it.clicked) {
      value = !value;
      onChange?.(value);
    }
    return value;
  }
  /** Buttons side by side; returns index clicked or -1. */
  buttonRow(labels, variant = "default") {
    let hit = -1;
    this.beginColumns(labels.length);
    labels.forEach((l, i) => {
      if (i > 0)
        this.nextColumn();
      if (this.button(l, { variant }))
        hit = i;
    });
    this.endColumns();
    return hit;
  }
  /** Square icon button. icon: close | chevron-left | chevron-right | chevron-down | chevron-up */
  iconButton(id, icon, size = 30, color2 = theme.textDim) {
    const w = this.get(id + "##icon", "iconbtn");
    const r = this.allocate(size, size);
    place(w.root, r.x, r.y, r.w, r.h);
    const it = this.interact(w, { x: 0, y: 0, w: r.w, h: r.h });
    const bg = this.img(w, "bg", Sprites.rounded(Math.round(size * 0.3)), TRANSPARENT);
    place(bg, 0, 0, r.w, r.h);
    imageSetColor(bg, withAlpha(theme.hover, w.hoverT));
    const ic = this.img(w, "ic", icon === "close" ? Sprites.cross() : Sprites.chevron(), color2, false, true);
    imageSetSprite(ic, icon === "close" ? Sprites.cross() : Sprites.chevron(), false);
    const g = Math.round(size * 0.7);
    place(ic, (size - g) / 2, (size - g) / 2, g, g);
    imageSetColor(ic, lerpColor(color2, theme.text, w.hoverT));
    imageSetRotation(ic, icon === "chevron-left" ? 180 : icon === "chevron-down" ? -90 : icon === "chevron-up" ? 90 : 0);
    return it.clicked;
  }
  // ── widgets: toggle ────────────────────────────────────────────────────
  toggle(label, value, onChange, opts = {}) {
    const w = this.get(label, "toggle");
    const hasDesc = !!opts.description;
    const r = this.allocate(hasDesc ? 46 : 36);
    place(w.root, r.x, r.y, r.w, r.h);
    const it = this.interact(w, { x: 0, y: 0, w: r.w, h: r.h }, 0, false, opts.disabled);
    if (it.clicked) {
      value = !value;
      onChange?.(value);
    }
    w.anim = approach(w.anim, value ? 1 : 0, this.dt * 14);
    const bg = this.img(w, "bg", Sprites.rounded(theme.widgetRadius), TRANSPARENT);
    place(bg, 0, 0, r.w, r.h);
    imageSetColor(bg, withAlpha(theme.hover, w.hoverT * 0.9));
    const style = this.host.settings.toggleStyle;
    const sw = style === "switch";
    const left = style === "checkbox-left";
    const bs = 24;
    const t = this.txt(w, "t", theme.fontSize, theme.text);
    const textX = sw ? 10 : left ? 8 + bs + 12 : 10;
    const textW = sw ? r.w - textX - 56 : left ? r.w - textX - 8 : r.w - textX - bs - 16;
    place(t, textX, hasDesc ? 3 : 0, textW, hasDesc ? 24 : r.h);
    textSet(t, _Gui.display(label));
    textSetColor(t, opts.disabled ? theme.textMuted : theme.text);
    if (hasDesc) {
      const d = this.txt(w, "d", theme.smallFontSize, theme.textMuted);
      place(d, textX, 24, textW, 18);
      textSet(d, opts.description);
      textSetColor(d, theme.textMuted);
    } else
      this.hide(w, "d");
    const line = this.img(w, "ln", Sprites.white(), theme.border, false);
    place(line, 0, r.h - 1, r.w, 1);
    imageSetColor(line, withAlpha(theme.border, theme.flat ? 0.7 : 0));
    if (sw) {
      const tw = 40, th = 22, ty = (r.h - th) / 2, tx = r.w - tw - 8;
      const trackC = lerpColor(theme.track, theme.accent, w.anim);
      const glow = this.img(w, "glow", Sprites.shadow(11, 8), TRANSPARENT);
      place(glow, tx - 6, ty - 6, tw + 12, th + 12);
      imageSetColor(glow, withAlpha(theme.accent, 0.35 * w.anim * theme.glow));
      const track = this.img(w, "track", Sprites.rounded(11), trackC);
      place(track, tx, ty, tw, th);
      imageSetColor(track, trackC);
      const ring = this.img(w, "ring", Sprites.ring(11, 1), theme.border);
      place(ring, tx, ty, tw, th);
      imageSetColor(ring, withAlpha(theme.border, 1 - w.anim));
      const knob = this.img(w, "knob", Sprites.circle(), theme.knob, false);
      const kx = tx + 3 + w.anim * (tw - 22);
      place(knob, kx, ty + 3, 16, 16);
      imageSetColor(knob, lerpColor(theme.textDim, theme.knob, w.anim));
      this.hide(w, "box");
      this.hide(w, "boxr");
      this.hide(w, "check");
    } else {
      const bx = left ? 8 : r.w - bs - 8, by = (r.h - bs) / 2;
      const boxC = lerpColor(theme.surface2, theme.accent, w.anim);
      const box = this.img(w, "box", Sprites.rounded(4), boxC);
      this.show(box);
      place(box, bx, by, bs, bs);
      imageSetColor(box, boxC);
      const boxr = this.img(w, "boxr", Sprites.ring(4, 1), theme.border);
      this.show(boxr);
      place(boxr, bx, by, bs, bs);
      imageSetColor(boxr, lerpColor(theme.border, theme.accent, Math.max(w.anim, w.hoverT * 0.5)));
      const check = this.img(w, "check", Sprites.check(), theme.onAccent, false, true);
      this.show(check);
      const cs = 6 + 12 * easeOutCubic(w.anim);
      place(check, bx + (bs - cs) / 2, by + (bs - cs) / 2, cs, cs);
      imageSetColor(check, withAlpha(theme.onAccent, w.anim));
      this.hide(w, "glow");
      this.hide(w, "track");
      this.hide(w, "ring");
      this.hide(w, "knob");
    }
    return value;
  }
  /**
   * One feature per line, the classic mod-menu row: label on the left, square
   * checkbox on the right (or left, per settings), optional settings chevron.
   */
  featureRow(label, enabled, hasSettings, settingsOpen, onToggle, onSettings) {
    const w = this.get(label, "featrow");
    const r = this.allocate(theme.widgetHeight + 4);
    place(w.root, r.x, r.y, r.w, r.h);
    const left = this.host.settings.toggleStyle === "checkbox-left";
    const bs = 24, gearW = hasSettings ? 32 : 0;
    const it = this.interact(w, { x: 0, y: 0, w: r.w - gearW, h: r.h });
    if (it.clicked) {
      enabled = !enabled;
      onToggle(enabled);
    }
    w.anim = approach(w.anim, enabled ? 1 : 0, this.dt * 16);
    const rowOn = withAlpha(theme.accent, theme.flat ? 0.1 * w.anim : 0);
    const bg = this.img(w, "bg", Sprites.rounded(theme.widgetRadius), TRANSPARENT);
    place(bg, 0, 0, r.w, r.h);
    imageSetColor(bg, lerpColor(rowOn, theme.hover, w.hoverT * 0.9));
    const bx = left ? 8 : r.w - gearW - bs - 8, by = (r.h - bs) / 2;
    const textX = left ? 8 + bs + 12 : 10;
    const t = this.txt(w, "t", theme.fontSize, theme.text);
    place(t, textX, 0, r.w - textX - (left ? gearW + 8 : bs + gearW + 16), r.h);
    textSet(t, _Gui.display(label));
    textSetColor(t, theme.text);
    const boxC = lerpColor(theme.surface2, theme.accent, w.anim);
    const box = this.img(w, "box", Sprites.rounded(4), boxC);
    place(box, bx, by, bs, bs);
    imageSetColor(box, boxC);
    const boxr = this.img(w, "boxr", Sprites.ring(4, 1), theme.border);
    place(boxr, bx, by, bs, bs);
    imageSetColor(boxr, lerpColor(theme.border, theme.accent, Math.max(w.anim, w.hoverT * 0.5)));
    const check = this.img(w, "check", Sprites.check(), theme.onAccent, false, true);
    const cs = 8 + 12 * easeOutCubic(w.anim);
    place(check, bx + (bs - cs) / 2, by + (bs - cs) / 2, cs, cs);
    imageSetColor(check, withAlpha(theme.onAccent, w.anim));
    if (hasSettings) {
      const gi = this.interact(w, { x: r.w - gearW, y: 0, w: gearW, h: r.h }, 1);
      if (gi.clicked)
        onSettings?.();
      const ch = this.img(w, "ch", Sprites.chevron(), theme.textDim, false, true);
      this.show(ch);
      place(ch, r.w - gearW + 7, (r.h - 18) / 2, 18, 18);
      imageSetColor(ch, gi.hovered || settingsOpen ? theme.text : theme.textDim);
      imageSetRotation(ch, settingsOpen ? -90 : 0);
    } else
      this.hide(w, "ch");
    const line = this.img(w, "ln", Sprites.white(), theme.border, false);
    place(line, 0, r.h - 1, r.w, 1);
    imageSetColor(line, withAlpha(theme.border, 0.7));
    return enabled;
  }
  // ── widgets: sliders ───────────────────────────────────────────────────
  slider(label, value, min, max, opts = {}) {
    const w = this.get(label, "slider");
    const r = this.allocate(46);
    place(w.root, r.x, r.y, r.w, r.h);
    const flat = theme.flat;
    const trackY = flat ? 28 : 30, trackH = flat ? 10 : 6, knob = flat ? 16 : 18, pad = 2;
    const it = this.interact(w, { x: 0, y: 20, w: r.w, h: r.h - 20 }, 0, true);
    const span = Math.max(1e-6, max - min);
    if (it.held) {
      const lp = this.layerPointer();
      const t2 = clamp01((lp.x - r.x - pad - knob / 2) / (r.w - pad * 2 - knob));
      let v = min + t2 * span;
      if (opts.step)
        v = Math.round(v / opts.step) * opts.step;
      v = clamp(v, min, max);
      if (v !== value) {
        value = v;
        opts.onChange?.(v);
      }
    }
    const t = clamp01((value - min) / span);
    const fmt = opts.format ?? ((v) => (Number.isInteger(opts.step ?? 0.1) && (opts.step ?? 0) >= 1 ? String(Math.round(v)) : v.toFixed(2)) + (opts.suffix ?? ""));
    const lt = this.txt(w, "l", theme.fontSize, theme.text);
    place(lt, 4, 0, r.w * 0.6, 22);
    textSet(lt, _Gui.display(label));
    textSetColor(lt, theme.text);
    const vt = this.txt(w, "v", theme.smallFontSize + 1, theme.textDim, "right", "middle", true);
    place(vt, r.w * 0.55, 0, r.w * 0.45 - 4, 22);
    textSet(vt, fmt(value));
    textSetColor(vt, lerpColor(theme.textDim, theme.accent2, w.hoverT));
    const track = this.img(w, "track", Sprites.rounded(3), theme.track);
    place(track, pad, trackY, r.w - pad * 2, trackH);
    imageSetColor(track, theme.track);
    const fillW = Math.max(0, (r.w - pad * 2 - knob) * t + knob / 2);
    const fill = this.img(w, "fill", Sprites.rounded(3), theme.accent);
    place(fill, pad, trackY, fillW, trackH);
    imageSetColor(fill, flat ? withAlpha(theme.accent, 0.85) : theme.accent);
    const kx = pad + (r.w - pad * 2 - knob) * t;
    if (flat) {
      this.hide(w, "fill2");
      this.hide(w, "glow");
      const kn = this.img(w, "knob", Sprites.rounded(3), theme.knob);
      imageSetSprite(kn, Sprites.rounded(3), true);
      place(kn, kx, trackY - 4, knob, trackH + 8);
      imageSetColor(kn, lerpColor(theme.knob, theme.accent2, Math.max(w.pressT, w.hoverT * 0.4)));
    } else {
      const fill2 = this.img(w, "fill2", Sprites.gradientH(), theme.accent2, false);
      this.show(fill2);
      place(fill2, pad, trackY, fillW, trackH);
      imageSetColor(fill2, withAlpha(theme.accent2, 0.9));
      const glow = this.img(w, "glow", Sprites.glow(), theme.accent, false);
      this.show(glow);
      const gs = knob + 14 + 8 * w.hoverT;
      place(glow, kx + knob / 2 - gs / 2, trackY + trackH / 2 - gs / 2, gs, gs);
      imageSetColor(glow, withAlpha(theme.accent, (0.35 + 0.35 * w.hoverT) * theme.glow));
      const kn = this.img(w, "knob", Sprites.circle(), theme.knob, false);
      imageSetSprite(kn, Sprites.circle(), false);
      place(kn, kx, trackY + trackH / 2 - knob / 2, knob, knob);
      imageSetColor(kn, lerpColor(theme.knob, theme.accent2, w.pressT * 0.5));
    }
    return value;
  }
  intSlider(label, value, min, max, onChange, suffix = "") {
    return Math.round(this.slider(label, value, min, max, { step: 1, onChange, format: (v) => String(Math.round(v)) + suffix }));
  }
  progress(t, label, color2 = theme.accent) {
    const w = this.get((label ?? "") + "##prog" + (this.L.cursorY | 0), "progress");
    const r = this.allocate(label ? 30 : 12);
    place(w.root, r.x, r.y, r.w, r.h);
    const barY = label ? 22 : 3, barH = 6;
    if (label) {
      const lt = this.txt(w, "l", theme.smallFontSize + 1, theme.textDim);
      place(lt, 2, 0, r.w * 0.7, 20);
      textSet(lt, label);
      textSetColor(lt, theme.textDim);
      const vt = this.txt(w, "v", theme.smallFontSize, theme.textDim, "right");
      place(vt, r.w * 0.6, 0, r.w * 0.4 - 2, 20);
      textSet(vt, `${Math.round(clamp01(t) * 100)}%`);
      textSetColor(vt, theme.textDim);
    }
    const track = this.img(w, "track", Sprites.rounded(3), theme.track);
    place(track, 0, barY, r.w, barH);
    imageSetColor(track, theme.track);
    const fill = this.img(w, "fill", Sprites.rounded(3), color2);
    place(fill, 0, barY, Math.max(6, r.w * clamp01(t)), barH);
    imageSetColor(fill, color2);
  }
  // ── widgets: dropdown / stepper ────────────────────────────────────────
  dropdown(label, index, options, onChange) {
    const w = this.get(label, "dropdown");
    const open = this.openDropdown === w.id;
    const rowH = 36, optH = 30;
    const r = this.allocate(rowH);
    place(w.root, r.x, r.y, r.w, r.h + (open ? options.length * optH + 8 : 0));
    const it = this.interact(w, { x: 0, y: 0, w: r.w, h: rowH });
    if (it.clicked)
      this.openDropdown = open ? 0 : w.id;
    w.anim = approach(w.anim, open ? 1 : 0, this.dt * 16);
    const bgc = lerpColor(theme.surface2, theme.hover, w.hoverT);
    const bg = this.img(w, "bg", Sprites.rounded(theme.widgetRadius), bgc);
    place(bg, 0, 0, r.w, rowH);
    imageSetColor(bg, bgc);
    const border = this.img(w, "border", Sprites.ring(theme.widgetRadius, 1), theme.border);
    place(border, 0, 0, r.w, rowH);
    imageSetColor(border, lerpColor(theme.border, theme.accent, Math.max(w.hoverT * 0.6, w.anim)));
    const lt = this.txt(w, "l", theme.fontSize, theme.text);
    place(lt, 10, 0, r.w * 0.5, rowH);
    textSet(lt, _Gui.display(label));
    textSetColor(lt, theme.text);
    const vt = this.txt(w, "v", theme.fontSize, theme.accent2, "right", "middle", true);
    place(vt, r.w * 0.4, 0, r.w * 0.6 - 34, rowH);
    textSet(vt, options[index] ?? "\u2014");
    textSetColor(vt, theme.accent2);
    const ch = this.img(w, "ch", Sprites.chevron(), theme.textDim, false, true);
    place(ch, r.w - 28, (rowH - 18) / 2, 18, 18);
    imageSetColor(ch, theme.textDim);
    imageSetRotation(ch, -90 * w.anim);
    const listH = open ? options.length * optH + 8 : 0;
    if (open) {
      const list = this.img(w, "list", Sprites.rounded(theme.widgetRadius), theme.surface);
      this.show(list);
      place(list, 0, rowH + 2, r.w, listH);
      imageSetColor(list, theme.surface);
      const listB = this.img(w, "listb", Sprites.ring(theme.widgetRadius, 1), theme.border);
      this.show(listB);
      place(listB, 0, rowH + 2, r.w, listH);
      imageSetColor(listB, theme.border);
      for (let i = 0; i < options.length; i++) {
        const oy = rowH + 6 + i * optH;
        const zone = i + 1;
        const oi = this.interact(w, { x: 4, y: oy, w: r.w - 8, h: optH }, zone);
        const hov = oi.hovered || oi.held;
        const ob = this.img(w, `o${i}`, Sprites.rounded(6), TRANSPARENT);
        this.show(ob);
        place(ob, 4, oy, r.w - 8, optH);
        imageSetColor(ob, hov ? theme.hover : i === index ? withAlpha(theme.accent, 0.15) : TRANSPARENT);
        const ot = this.txt(w, `t${i}`, theme.fontSize, theme.text);
        this.show(ot);
        place(ot, 14, oy, r.w - 28, optH);
        textSet(ot, options[i]);
        textSetColor(ot, i === index ? theme.accent2 : theme.text);
        if (oi.clicked) {
          if (i !== index) {
            index = i;
            onChange?.(i);
          }
          this.openDropdown = 0;
        }
      }
      this.L.lineH = Math.max(this.L.lineH, rowH + listH + 2);
      this.L.maxY = Math.max(this.L.maxY, r.y + rowH + listH + 2);
    } else {
      this.hide(w, "list");
      this.hide(w, "listb");
      for (let i = 0; w.parts[`o${i}`]; i++) {
        this.hide(w, `o${i}`);
        this.hide(w, `t${i}`);
      }
    }
    return index;
  }
  /** Numeric stepper: label  [-] value [+] */
  stepper(label, value, min, max, step = 1, onChange, format) {
    const w = this.get(label, "stepper");
    const r = this.allocate(36);
    place(w.root, r.x, r.y, r.w, r.h);
    const bw = 30, vw = 64;
    const plusX = r.w - bw, valX = plusX - vw, minusX = valX - bw;
    const lt = this.txt(w, "l", theme.fontSize, theme.text);
    place(lt, 4, 0, minusX - 8, r.h);
    textSet(lt, _Gui.display(label));
    textSetColor(lt, theme.text);
    const mk = (name, x, zone, glyph) => {
      const it = this.interact(w, { x, y: 3, w: bw, h: r.h - 6 }, zone);
      const bg = this.img(w, name, Sprites.rounded(8), theme.surface2);
      place(bg, x, 3, bw, r.h - 6);
      imageSetColor(bg, it.hovered || it.held ? theme.hover : theme.surface2);
      const t = this.txt(w, name + "t", theme.fontSize + 2, theme.text, "center", "middle", true);
      place(t, x, 3, bw, r.h - 6);
      textSet(t, glyph);
      textSetColor(t, it.hovered ? theme.accent2 : theme.text);
      return it.clicked;
    };
    const vt = this.txt(w, "v", theme.fontSize, theme.accent2, "center", "middle", true);
    place(vt, valX, 0, vw, r.h);
    textSet(vt, format ? format(value) : String(Math.round(value * 100) / 100));
    textSetColor(vt, theme.accent2);
    if (mk("m", minusX, 1, "\u2212") && value - step >= min - 1e-9) {
      value = Math.max(min, value - step);
      onChange?.(value);
    }
    if (mk("p", plusX, 2, "+") && value + step <= max + 1e-9) {
      value = Math.min(max, value + step);
      onChange?.(value);
    }
    return value;
  }
  // ── widgets: sections ──────────────────────────────────────────────────
  collapsingHeader(label, defaultOpen = false) {
    const w = this.get(label, "collapse");
    if (w.state.open === void 0)
      w.state.open = defaultOpen;
    const r = this.allocate(34);
    place(w.root, r.x, r.y, r.w, r.h);
    const it = this.interact(w, { x: 0, y: 0, w: r.w, h: r.h });
    if (it.clicked)
      w.state.open = !w.state.open;
    const open = !!w.state.open;
    w.anim = approach(w.anim, open ? 1 : 0, this.dt * 16);
    const bgc = lerpColor(theme.surface2, theme.hover, w.hoverT);
    const bg = this.img(w, "bg", Sprites.rounded(theme.widgetRadius), bgc);
    place(bg, 0, 0, r.w, r.h);
    imageSetColor(bg, bgc);
    const bar = this.img(w, "bar", Sprites.rounded(2), theme.accent);
    place(bar, 0, 8, 3, r.h - 16);
    imageSetColor(bar, withAlpha(theme.accent, theme.flat ? 0 : 0.4 + 0.6 * w.anim));
    const ch = this.img(w, "ch", Sprites.chevron(), theme.textDim, false, true);
    place(ch, 8, (r.h - 18) / 2, 18, 18);
    imageSetColor(ch, lerpColor(theme.textDim, theme.accent2, w.anim));
    imageSetRotation(ch, -90 * w.anim);
    const t = this.txt(w, "t", theme.fontSize, theme.text, "left", "middle", true);
    place(t, 30, 0, r.w - 36, r.h);
    textSet(t, _Gui.display(label));
    textSetColor(t, theme.text);
    return open;
  }
  /** Card = rounded box grouping the items drawn until endCard(). */
  beginCard(title) {
    this.flushLine();
    const w = this.get((title ?? "card") + "##card" + (this.L.cursorY | 0), "card");
    if (w.created)
      setAsFirstSibling(transformOf(w.root.go));
    const L = this.L;
    const pad = 10;
    const startY = L.cursorY;
    const bg = this.img(w, "bg", Sprites.rounded(theme.radius - 4), theme.surface);
    imageSetColor(bg, theme.surface);
    const border = this.img(w, "border", Sprites.ring(theme.radius - 4, 1), theme.border);
    imageSetColor(border, theme.border);
    L.cards.push({ w, startY, indent: L.indent, right: L.rightEdge, pad, hasTitle: !!title });
    L.indent += pad;
    L.rightEdge -= pad;
    L.cursorX = L.indent;
    L.cursorY += pad;
    if (title) {
      const t = this.txt(w, "t", theme.smallFontSize, theme.textMuted, "left", "middle", true);
      this.show(t);
      place(t, pad + 2, 6, L.rightEdge - L.indent, 18);
      textSet(t, title.toUpperCase());
      textSetColor(t, theme.textMuted);
      L.cursorY += 14;
    } else
      this.hide(w, "t");
  }
  endCard() {
    const L = this.L, f = L.cards.pop();
    if (!f)
      return;
    this.flushLine();
    const h = L.cursorY - f.startY - theme.spacing + f.pad;
    const w = f.w;
    place(w.root, f.indent, f.startY, f.right - f.indent, h);
    place(w.parts.bg, 0, 0, f.right - f.indent, h);
    place(w.parts.border, 0, 0, f.right - f.indent, h);
    L.indent = f.indent;
    L.rightEdge = f.right;
    L.cursorX = L.indent;
    L.cursorY = f.startY + h;
    L.lineH = 0;
    L.maxY = Math.max(L.maxY, L.cursorY);
    L.cursorY += theme.spacing;
  }
  statCard(title, value, sub2 = "", accent = theme.accent) {
    const w = this.get(title + "##stat", "stat");
    const r = this.allocate(68);
    place(w.root, r.x, r.y, r.w, r.h);
    const bg = this.img(w, "bg", Sprites.rounded(theme.radius - 4), theme.surface);
    place(bg, 0, 0, r.w, r.h);
    imageSetColor(bg, theme.surface);
    const border = this.img(w, "border", Sprites.ring(theme.radius - 4, 1), theme.border);
    place(border, 0, 0, r.w, r.h);
    imageSetColor(border, theme.border);
    const bar = this.img(w, "bar", Sprites.rounded(2), accent);
    place(bar, 8, 12, 3, r.h - 24);
    imageSetColor(bar, accent);
    const t = this.txt(w, "t", theme.smallFontSize, theme.textMuted, "left", "middle", true);
    place(t, 20, 8, r.w - 26, 18);
    textSet(t, title.toUpperCase());
    textSetColor(t, theme.textMuted);
    const v = this.txt(w, "v", theme.titleSize + 3, theme.text, "left", "middle", true);
    place(v, 20, 24, r.w - 26, 26);
    textSet(v, value);
    textSetColor(v, theme.text);
    const s = this.txt(w, "s", theme.smallFontSize, accent, "left", "middle");
    place(s, 20, 48, r.w - 26, 16);
    textSet(s, sub2);
    textSetColor(s, accent);
  }
  // ── widgets: tabs ──────────────────────────────────────────────────────
  tabs(id, selected, labels, onChange) {
    const w = this.get(id + "##tabs", "tabs");
    const r = this.allocate(34);
    place(w.root, r.x, r.y, r.w, r.h);
    const n = Math.max(1, labels.length), tw = (r.w - 6) / n;
    if (w.state.pos === void 0)
      w.state.pos = selected;
    const bg = this.img(w, "bg", Sprites.rounded(theme.widgetRadius), theme.surface2);
    place(bg, 0, 0, r.w, r.h);
    imageSetColor(bg, theme.surface2);
    w.state.pos = lerp(w.state.pos, selected, damp(18, this.dt));
    const ind = this.img(w, "ind", Sprites.rounded(theme.widgetRadius - 2), theme.accent);
    place(ind, 3 + w.state.pos * tw, 3, tw, r.h - 6);
    imageSetColor(ind, theme.accent);
    for (let i = 0; i < labels.length; i++) {
      const it = this.interact(w, { x: 3 + i * tw, y: 0, w: tw, h: r.h }, i + 1);
      if (it.clicked && i !== selected) {
        selected = i;
        onChange?.(i);
      }
      const t = this.txt(w, `t${i}`, theme.smallFontSize + 1, theme.textDim, "center", "middle", true);
      this.show(t);
      place(t, 3 + i * tw, 0, tw, r.h);
      textSet(t, labels[i]);
      const sel = Math.abs(w.state.pos - i) < 0.5;
      textSetColor(t, sel ? theme.onAccent : it.hovered ? theme.text : theme.textDim);
    }
    for (let i = labels.length; w.parts[`t${i}`]; i++)
      this.hide(w, `t${i}`);
    return selected;
  }
  // ── widgets: color picker ──────────────────────────────────────────────
  colorPicker(label, value, onChange) {
    const w = this.get(label, "color");
    const r = this.allocate(36);
    place(w.root, r.x, r.y, r.w, r.h);
    const it = this.interact(w, { x: 0, y: 0, w: r.w, h: r.h });
    if (it.clicked)
      w.state.open = !w.state.open;
    const open = !!w.state.open;
    w.anim = approach(w.anim, open ? 1 : 0, this.dt * 16);
    const bgc = lerpColor(theme.surface2, theme.hover, w.hoverT);
    const bg = this.img(w, "bg", Sprites.rounded(theme.widgetRadius), bgc);
    place(bg, 0, 0, r.w, r.h);
    imageSetColor(bg, bgc);
    const sw = this.img(w, "sw", Sprites.rounded(6), value);
    place(sw, 8, 7, 22, 22);
    imageSetColor(sw, withAlpha(value, 1));
    const swr = this.img(w, "swr", Sprites.ring(6, 1), theme.border);
    place(swr, 8, 7, 22, 22);
    imageSetColor(swr, theme.border);
    const t = this.txt(w, "t", theme.fontSize, theme.text);
    place(t, 40, 0, r.w * 0.5, r.h);
    textSet(t, _Gui.display(label));
    textSetColor(t, theme.text);
    const hx = this.txt(w, "hex", theme.smallFontSize, theme.textDim, "right", "middle", true);
    place(hx, r.w * 0.5, 0, r.w * 0.5 - 34, r.h);
    textSet(hx, toHex(value).toUpperCase());
    textSetColor(hx, theme.textDim);
    const ch = this.img(w, "ch", Sprites.chevron(), theme.textDim, false, true);
    place(ch, r.w - 28, 9, 18, 18);
    imageSetColor(ch, theme.textDim);
    imageSetRotation(ch, -90 * w.anim);
    if (!open)
      return value;
    this.pushId(label);
    this.indent(8);
    const presets = [0, 0.04, 0.09, 0.16, 0.33, 0.48, 0.55, 0.62, 0.72, 0.83, 0.93];
    const pw = this.get("presets##" + label, "swatches");
    const pr = this.allocate(26);
    place(pw.root, pr.x, pr.y, pr.w, pr.h);
    const cell = pr.w / (presets.length + 1);
    presets.forEach((h, i) => {
      const c = hsv(h, 0.75, 0.95);
      const pi = this.interact(pw, { x: i * cell, y: 0, w: cell, h: pr.h }, i + 1);
      const s = this.img(pw, `s${i}`, Sprites.rounded(6), c);
      place(s, i * cell + 2, pi.hovered ? 0 : 3, cell - 4, pi.hovered ? pr.h : pr.h - 6);
      imageSetColor(s, c);
      if (pi.clicked) {
        value = { ...c, a: value.a };
        onChange?.(value);
      }
    });
    {
      const i = presets.length;
      const c = { r: 1, g: 1, b: 1, a: 1 };
      const pi = this.interact(pw, { x: i * cell, y: 0, w: cell, h: pr.h }, i + 1);
      const s = this.img(pw, `s${i}`, Sprites.rounded(6), c);
      place(s, i * cell + 2, pi.hovered ? 0 : 3, cell - 4, pi.hovered ? pr.h : pr.h - 6);
      imageSetColor(s, c);
      if (pi.clicked) {
        value = { ...c, a: value.a };
        onChange?.(value);
      }
    }
    const set = (k, v) => {
      value = { ...value, [k]: v };
      onChange?.(value);
    };
    this.slider("R", value.r, 0, 1, { onChange: (v) => set("r", v) });
    this.slider("G", value.g, 0, 1, { onChange: (v) => set("g", v) });
    this.slider("B", value.b, 0, 1, { onChange: (v) => set("b", v) });
    const hsvv = toHsv(value);
    this.slider("Hue", hsvv.h, 0, 1, { onChange: (v) => {
      const c = hsv(v, Math.max(hsvv.s, 0.05), Math.max(hsvv.v, 0.05), value.a);
      value = c;
      onChange?.(c);
    } });
    this.unindent(8);
    this.popId();
    return value;
  }
  // ── widgets: keybind ───────────────────────────────────────────────────
  keybind(label, current, onChange) {
    const w = this.get(label, "keybind");
    const r = this.allocate(36);
    place(w.root, r.x, r.y, r.w, r.h);
    const capturing = this.capturing === w.id;
    const bw = 150, cw = 30;
    const it = this.interact(w, { x: r.w - bw - cw - 4, y: 3, w: bw, h: r.h - 6 }, 1);
    const cl = this.interact(w, { x: r.w - cw, y: 3, w: cw, h: r.h - 6 }, 2);
    const lt = this.txt(w, "l", theme.fontSize, theme.text);
    place(lt, 4, 0, r.w - bw - cw - 12, r.h);
    textSet(lt, _Gui.display(label));
    textSetColor(lt, theme.text);
    if (it.clicked) {
      this.capturing = capturing ? 0 : w.id;
      w.state.phase = "release";
    }
    if (capturing) {
      const inp = this.host.input;
      if (w.state.phase === "release") {
        if (!ALL_BUTTONS.some((b) => b !== "none" && inp.isDown(b)))
          w.state.phase = "listen";
      } else {
        const b = inp.anyPressed();
        if (b) {
          current = b;
          onChange?.(b);
          this.capturing = 0;
        }
      }
    }
    const bgc = capturing ? withAlpha(theme.accent, 0.25) : lerpColor(theme.surface2, theme.hover, it.hovered ? 1 : 0);
    const bg = this.img(w, "bg", Sprites.rounded(8), bgc);
    place(bg, r.w - bw - cw - 4, 3, bw, r.h - 6);
    imageSetColor(bg, bgc);
    const br = this.img(w, "br", Sprites.ring(8, 1), theme.border);
    place(br, r.w - bw - cw - 4, 3, bw, r.h - 6);
    imageSetColor(br, capturing ? theme.accent : theme.border);
    const bt = this.txt(w, "b", theme.smallFontSize + 1, theme.accent2, "center", "middle", true);
    place(bt, r.w - bw - cw - 4, 3, bw, r.h - 6);
    textSet(bt, capturing ? Math.floor(this.now * 2) % 2 ? "press a button" : "press a button\u2026" : BUTTON_LABELS[current]);
    textSetColor(bt, capturing ? theme.accent2 : current === "none" ? theme.textMuted : theme.text);
    const xb = this.img(w, "x", Sprites.cross(), theme.textDim, false, true);
    place(xb, r.w - cw + 6, 9, 18, 18);
    imageSetColor(xb, cl.hovered ? theme.danger : theme.textMuted);
    if (cl.clicked) {
      current = "none";
      onChange?.("none");
      this.capturing = 0;
    }
    return current;
  }
  // ── widgets: text field (opens the virtual keyboard) ───────────────────
  textField(label, value, placeholder = "", onChange) {
    const w = this.get(label, "textfield");
    const r = this.allocate(36);
    place(w.root, r.x, r.y, r.w, r.h);
    const hasLabel = _Gui.display(label).length > 0;
    const boxX = hasLabel ? Math.round(r.w * 0.38) : 0;
    const it = this.interact(w, { x: boxX, y: 0, w: r.w - boxX, h: r.h });
    const kb = this.keyboard;
    const editing = kb.open && kb.targetId === w.id;
    if (it.clicked && !kb.open) {
      kb.open = true;
      kb.targetId = w.id;
      kb.buffer = value;
      kb.title = _Gui.display(label) || placeholder || "Text";
      kb.shift = false;
      kb.symbols = false;
      kb.changed = false;
    }
    if (editing && kb.buffer !== value) {
      value = kb.buffer;
      onChange?.(value);
    }
    if (hasLabel) {
      const lt = this.txt(w, "l", theme.fontSize, theme.text);
      place(lt, 4, 0, boxX - 8, r.h);
      textSet(lt, _Gui.display(label));
      textSetColor(lt, theme.text);
    }
    const bgc = lerpColor(theme.surface2, theme.hover, w.hoverT);
    const bg = this.img(w, "bg", Sprites.rounded(8), bgc);
    place(bg, boxX, 2, r.w - boxX, r.h - 4);
    imageSetColor(bg, bgc);
    const br = this.img(w, "br", Sprites.ring(8, 1), theme.border);
    place(br, boxX, 2, r.w - boxX, r.h - 4);
    imageSetColor(br, editing ? theme.accent : theme.border);
    const vt = this.txt(w, "v", theme.fontSize, theme.text);
    place(vt, boxX + 10, 0, r.w - boxX - 20, r.h);
    const showCaret = editing && Math.floor(this.now * 2) % 2 === 0;
    textSet(vt, value.length ? value + (showCaret ? "|" : "") : editing ? showCaret ? "|" : "" : placeholder);
    textSetColor(vt, value.length ? theme.text : theme.textMuted);
    return value;
  }
  // ── sidebar / chrome helpers (used by menu.ts) ─────────────────────────
  sidebarItem(label, active, icon = "", badge = "") {
    const w = this.get(label + "##side", "sidebar");
    const r = this.allocate(40);
    place(w.root, r.x, r.y, r.w, r.h);
    const it = this.interact(w, { x: 0, y: 0, w: r.w, h: r.h });
    w.anim = approach(w.anim, active ? 1 : 0, this.dt * 14);
    const bgc = lerpColor(withAlpha(theme.sidebarActive, 0), theme.sidebarActive, Math.max(w.anim, w.hoverT * 0.6));
    const bg = this.img(w, "bg", Sprites.rounded(10), bgc);
    place(bg, 0, 0, r.w, r.h);
    imageSetColor(bg, bgc);
    const bar = this.img(w, "bar", Sprites.rounded(2), theme.accent);
    place(bar, 0, 10 + (1 - w.anim) * 8, 3, (r.h - 20) * w.anim + 1);
    imageSetColor(bar, withAlpha(theme.accent, theme.flat ? 0 : w.anim));
    const ic = this.txt(w, "i", theme.fontSize, theme.sidebarText, "center", "middle", true);
    place(ic, 8, 0, 24, r.h);
    textSet(ic, icon);
    textSetColor(ic, lerpColor(theme.sidebarText, theme.accent2, w.anim));
    const t = this.txt(w, "t", theme.fontSize, theme.sidebarText, "left", "middle", true);
    place(t, icon ? 36 : 14, 0, r.w - (icon ? 40 : 18), r.h);
    textSet(t, _Gui.display(label));
    textSetColor(t, lerpColor(lerpColor(theme.sidebarText, theme.text, w.hoverT), theme.sidebarActiveText, w.anim));
    if (badge) {
      const b = this.img(w, "bb", Sprites.rounded(8), theme.accent);
      this.show(b);
      place(b, r.w - 30, 12, 22, 16);
      imageSetColor(b, theme.accent);
      const bt = this.txt(w, "bt", theme.smallFontSize - 1, theme.onAccent, "center", "middle", true);
      this.show(bt);
      place(bt, r.w - 30, 12, 22, 16);
      textSet(bt, badge);
      textSetColor(bt, theme.onAccent);
    } else {
      this.hide(w, "bb");
      this.hide(w, "bt");
    }
    return it.clicked;
  }
  /** Toast card drawn at an absolute position inside the current layer. */
  toast(id, x, y, w, h, kind, title, message, progress, alpha) {
    const wd = this.get(`toast${id}`, "toast");
    place(wd.root, x, y, w, h);
    const col = kind === "success" ? theme.success : kind === "warning" ? theme.warning : kind === "error" ? theme.danger : theme.info;
    const sh = this.img(wd, "sh", Sprites.shadow(12, 14), theme.shadow);
    place(sh, -10, -6, w + 20, h + 22);
    imageSetColor(sh, withAlpha(theme.shadow, (theme.flat ? 0.35 : 0.6) * alpha));
    const tr = theme.flat ? 4 : 12;
    const bg = this.img(wd, "bg", Sprites.rounded(tr), theme.surface);
    imageSetSprite(bg, Sprites.rounded(tr), true);
    place(bg, 0, 0, w, h);
    imageSetColor(bg, withAlpha(theme.surface, alpha));
    const br = this.img(wd, "br", Sprites.ring(tr, 1), theme.border);
    imageSetSprite(br, Sprites.ring(tr, 1), true);
    place(br, 0, 0, w, h);
    imageSetColor(br, withAlpha(theme.border, alpha));
    const bar = this.img(wd, "bar", Sprites.rounded(2), col);
    place(bar, 8, 10, 4, h - 20);
    imageSetColor(bar, withAlpha(col, alpha));
    const t = this.txt(wd, "t", theme.fontSize, theme.text, "left", "middle", true);
    place(t, 22, 6, w - 30, 22);
    textSet(t, title);
    textSetColor(t, withAlpha(theme.text, alpha));
    const m = this.txt(wd, "m", theme.smallFontSize + 1, theme.textDim);
    place(m, 22, 26, w - 30, h - 34);
    textSet(m, message);
    textSetColor(m, withAlpha(theme.textDim, alpha));
    textSetWrap(m, true);
    const pg = this.img(wd, "pg", Sprites.rounded(1), col);
    place(pg, 22, h - 5, Math.max(2, (w - 30) * clamp01(progress)), 2);
    imageSetColor(pg, withAlpha(col, 0.7 * alpha));
  }
  /** Pointer cursor dot. */
  cursor(x, y, size, alpha) {
    const w = this.get("cursor##ptr", "cursor");
    place(w.root, x - size / 2, y - size / 2, size, size);
    const g = this.img(w, "g", Sprites.glow(), theme.accent2, false);
    place(g, -size * 0.6, -size * 0.6, size * 2.2, size * 2.2);
    imageSetColor(g, withAlpha(theme.accent2, 0.45 * alpha));
    const d = this.img(w, "d", Sprites.circle(), theme.knob, false);
    place(d, 0, 0, size, size);
    imageSetColor(d, withAlpha(theme.knob, alpha));
  }
  /** Tooltip bubble (drawn by menu.ts in the overlay layer). */
  tooltipBubble(text, x, y, maxW) {
    const w = this.get("tooltip##ov", "tooltipb");
    const tw = Math.min(maxW, estWidth(text, theme.smallFontSize + 1) + 24);
    const h = 30;
    place(w.root, x, y, tw, h);
    const bg = this.img(w, "bg", Sprites.rounded(8), theme.surface2);
    place(bg, 0, 0, tw, h);
    imageSetColor(bg, theme.surface2);
    const br = this.img(w, "br", Sprites.ring(8, 1), theme.accent);
    place(br, 0, 0, tw, h);
    imageSetColor(br, withAlpha(theme.accent, 0.6));
    const t = this.txt(w, "t", theme.smallFontSize + 1, theme.text, "center", "middle");
    place(t, 6, 0, tw - 12, h);
    textSet(t, text);
    textSetColor(t, theme.text);
  }
  /** Full-layer dim rectangle (modal backdrop). */
  dim(x, y, w, h, alpha) {
    const wd = this.get("dim##ov", "dim");
    place(wd.root, x, y, w, h);
    const bg = this.img(wd, "bg", Sprites.rounded(theme.radius), theme.bg);
    place(bg, 0, 0, w, h);
    imageSetColor(bg, withAlpha(theme.bg, alpha));
  }
  /** Panel box with border used by the keyboard overlay. */
  panelBox(id, x, y, w, h) {
    const wd = this.get(id + "##box", "box");
    place(wd.root, x, y, w, h);
    const sh = this.img(wd, "sh", Sprites.shadow(14, 18), theme.shadow);
    place(sh, -14, -10, w + 28, h + 30);
    imageSetColor(sh, theme.shadow);
    const kr = theme.flat ? 6 : 14;
    const bg = this.img(wd, "bg", Sprites.rounded(kr), theme.surface);
    imageSetSprite(bg, Sprites.rounded(kr), true);
    place(bg, 0, 0, w, h);
    imageSetColor(bg, theme.surface);
    const br = this.img(wd, "br", Sprites.ring(kr, 1), theme.border);
    imageSetSprite(br, Sprites.ring(kr, 1), true);
    place(br, 0, 0, w, h);
    imageSetColor(br, theme.border);
  }
  /** Moves the layout cursor (used by absolute-positioned overlays). */
  setCursor(x, y) {
    this.flushLine();
    this.L.indent = x;
    this.L.cursorX = x;
    this.L.cursorY = y;
  }
  setRightEdge(x) {
    this.L.rightEdge = x;
  }
};
function GuiText(s) {
  return s;
}

// src/ui/pointer.ts
var PRESS_ENGAGE = -6e-3;
var PRESS_RELEASE = -0.018;
var HOVER_RANGE = 0.12;
var PointerSource = class {
  state = { valid: false, x: 0, y: 0, down: false, pressed: false, released: false, depth: 0 };
  latched = false;
  laserGo = null;
  laserLr = null;
  laserVisible = false;
  laserFailed = false;
  compute(settings2, input, rig, panel, active) {
    const prevDown = this.state.down;
    const s = { valid: false, x: 0, y: 0, down: false, pressed: false, released: false, depth: 0 };
    const pointerHand = settings2.hand === "left" ? "right" : "left";
    const mode = input.desktop ? "gaze" : settings2.pointerMode;
    let origin = null, dir = null, tip = null;
    if (active) {
      if (mode === "finger") {
        const h = rig.pose(pointerHand);
        if (h.valid)
          tip = add(h.pos, qrot(h.rot, { x: settings2.fingerOffset.x, y: settings2.fingerOffset.y, z: settings2.fingerOffset.z }));
      } else if (mode === "laser") {
        const h = rig.pose(pointerHand);
        if (h.valid) {
          origin = h.pos;
          dir = qforward(h.rot);
        }
      } else {
        const h = rig.pose("head");
        if (h.valid) {
          origin = h.pos;
          dir = qforward(h.rot);
        }
      }
    }
    const inv = qinv(panel.rot);
    const toLocal = (world) => {
      const rel = qrot(inv, sub(world, panel.pos));
      return { x: rel.x / panel.mpu + panel.width / 2, y: panel.height / 2 - rel.y / panel.mpu, z: rel.z };
    };
    const inBounds = (x, y, margin) => x >= -margin && x <= panel.width + margin && y >= -margin && y <= panel.height + margin;
    if (tip) {
      const l = toLocal(tip);
      s.depth = l.z;
      if (inBounds(l.x, l.y, 30) && l.z > -HOVER_RANGE && l.z < 0.05) {
        s.valid = true;
        s.x = l.x;
        s.y = l.y;
        if (!this.latched && l.z > PRESS_ENGAGE)
          this.latched = true;
        else if (this.latched && l.z < PRESS_RELEASE)
          this.latched = false;
        s.down = this.latched && inBounds(l.x, l.y, 4);
      } else {
        this.latched = false;
      }
    } else if (origin && dir) {
      const n = qforward(panel.rot);
      const denom = dot(dir, n);
      let end = add(origin, mul(dir, 1));
      if (Math.abs(denom) > 1e-4) {
        const t = dot(sub(panel.pos, origin), n) / denom;
        if (t > 0 && t < 4) {
          const hit = add(origin, mul(dir, t));
          const l = toLocal(hit);
          if (inBounds(l.x, l.y, 30)) {
            s.valid = true;
            s.x = l.x;
            s.y = l.y;
            s.depth = 0;
            end = hit;
            const btn = mode === "gaze" ? "right.trigger" : settings2.laserButton;
            s.down = input.isDown(btn) && inBounds(l.x, l.y, 4);
          }
        }
      }
      if (mode === "laser")
        this.updateLaser(origin, end, true);
    }
    if (mode !== "laser" || !active)
      this.updateLaser(null, null, false);
    s.pressed = s.down && !prevDown;
    s.released = !s.down && prevDown;
    if (!s.valid && prevDown) {
      s.released = true;
    }
    this.state = s;
    return s;
  }
  updateLaser(origin, end, visible) {
    if (this.laserFailed)
      return;
    try {
      if (visible && !this.laserGo) {
        const go = newGameObject("ACMenu.Laser");
        const lr = addComponent(go, UE.LineRenderer);
        lr.method("set_useWorldSpace").invoke(true);
        lr.method("set_positionCount").invoke(2);
        lr.method("set_startWidth").invoke(4e-3);
        lr.method("set_endWidth").invoke(1e-3);
        const mat = newMaterial(["Universal Render Pipeline/Unlit", "Sprites/Default", "Unlit/Color", "UI/Default"]);
        if (mat) {
          mat.method("set_color").invoke(color(theme.accent2));
          lr.method("set_material").invoke(mat);
        }
        lr.method("set_startColor").invoke(color(theme.accent2));
        lr.method("set_endColor").invoke(color({ ...theme.accent, a: 0.2 }));
        this.laserGo = go;
        this.laserLr = lr;
      }
      if (!this.laserGo || !this.laserLr)
        return;
      if (visible !== this.laserVisible) {
        setActive(this.laserGo, visible);
        this.laserVisible = visible;
      }
      if (visible && origin && end) {
        this.laserLr.method("SetPosition").invoke(0, vec3(origin));
        this.laserLr.method("SetPosition").invoke(1, vec3(end));
      }
    } catch (e) {
      this.laserFailed = true;
      log.warn(`laser visual disabled: ${String(e)}`);
    }
  }
  destroy() {
    if (this.laserGo) {
      destroy(this.laserGo);
      this.laserGo = null;
      this.laserLr = null;
    }
  }
  /** Distance helper for the settings page ("finger is X cm from the panel"). */
  static describeDepth(d) {
    return `${(Math.abs(d) * 100).toFixed(1)} cm ${d < 0 ? "in front" : "behind"}`;
  }
};

// src/ui/notifications.ts
var nextId = 1;
var MAX_VISIBLE = 4;
var Notify = {
  list: [],
  now: 0,
  show(kind, title, message = "", seconds = 3.5) {
    const t = { id: nextId++, kind, title, message, born: this.now, duration: seconds };
    this.list.push(t);
    if (this.list.length > 12)
      this.list.shift();
    return t.id;
  },
  info(title, message = "", seconds) {
    return this.show("info", title, message, seconds);
  },
  success(title, message = "", seconds) {
    return this.show("success", title, message, seconds);
  },
  warn(title, message = "", seconds) {
    return this.show("warning", title, message, seconds);
  },
  error(title, message = "", seconds) {
    return this.show("error", title, message, seconds ?? 6);
  },
  clear() {
    this.list.length = 0;
  },
  /** Draws the active toasts inside the current (overlay) layer. */
  draw(gui, rightX, topY, width, now) {
    this.now = now;
    this.list = this.list.filter((t) => now - t.born < t.duration + 0.35);
    const visible = this.list.slice(-MAX_VISIBLE);
    let y = topY;
    for (const t of visible) {
      const age = now - t.born;
      const slide = easeOutBack(clamp01(age / 0.28));
      const fade = age > t.duration ? clamp01(1 - (age - t.duration) / 0.35) : 1;
      const h = t.message ? 58 : 36;
      const x = rightX - width + (1 - slide) * (width + 30);
      gui.toast(t.id, x, y, width, h, t.kind, t.title, t.message, 1 - clamp01(age / t.duration), fade * slide);
      y += h + 8;
    }
  }
};

// src/ui/keyboard.ts
var ROWS_ALPHA = ["1234567890", "qwertyuiop", "asdfghjkl", "zxcvbnm"];
var ROWS_SYM = ["1234567890", "!@#$%^&*()", "-_=+[]{};:", "'\",.<>/?\\|~`"];
function drawKeyboard(gui, panelW, panelH) {
  const kb = gui.keyboard;
  if (!kb.open)
    return;
  const boxW = Math.min(panelW - 24, 470), boxH = 300;
  const bx = (panelW - boxW) / 2, by = panelH - boxH - 34;
  gui.dim(0, 0, panelW, panelH, 0.72);
  gui.panelBox("kb", bx, by, boxW, boxH);
  const pad = 12;
  gui.setCursor(bx + pad, by + pad);
  gui.setRightEdge(bx + boxW - pad);
  gui.setNextWidth(boxW - pad * 2 - 40);
  gui.label(kb.title, { color: theme.textMuted, size: theme.smallFontSize, bold: true });
  gui.sameLine();
  if (gui.iconButton("kbclose", "close", 28))
    close(gui, false);
  gui.setCursor(bx + pad, by + pad + 30);
  gui.setNextWidth(boxW - pad * 2);
  gui.textField("##kbpreview", kb.buffer, "type\u2026");
  const rows = kb.symbols ? ROWS_SYM : ROWS_ALPHA;
  const keyW = (boxW - pad * 2 - 9 * 4) / 10, keyH = 32, gap = 4;
  let y = by + pad + 74;
  for (let r = 0; r < rows.length; r++) {
    const chars = rows[r];
    const rowW = chars.length * keyW + (chars.length - 1) * gap;
    const rowX = bx + (boxW - rowW) / 2;
    gui.setCursor(rowX, y);
    for (let i = 0; i < chars.length; i++) {
      if (i > 0)
        gui.sameLine();
      const ch = chars[i];
      const label = kb.shift && !kb.symbols ? ch.toUpperCase() : ch;
      if (gui.button(`${label}##k${r}${i}`, { width: keyW, height: keyH })) {
        kb.buffer += label;
        if (kb.shift)
          kb.shift = false;
      }
    }
    y += keyH + gap;
  }
  gui.setCursor(bx + pad, y);
  if (gui.button(kb.symbols ? "abc##kbsym" : "#+=##kbsym", { width: 56, height: keyH }))
    kb.symbols = !kb.symbols;
  gui.sameLine();
  if (gui.button("shift##kbshift", { width: 64, height: keyH, variant: kb.shift ? "primary" : "default" }))
    kb.shift = !kb.shift;
  gui.sameLine();
  if (gui.button("space##kbspace", { width: boxW - pad * 2 - 56 - 64 - 60 - 80 - 4 * 4, height: keyH }))
    kb.buffer += " ";
  gui.sameLine();
  if (gui.button("del##kbdel", { width: 60, height: keyH, variant: "danger" }))
    kb.buffer = kb.buffer.slice(0, -1);
  gui.sameLine();
  if (gui.button("enter##kbenter", { width: 80, height: keyH, variant: "primary" }))
    close(gui, true);
}
function close(gui, commit) {
  const kb = gui.keyboard;
  kb.open = false;
  kb.changed = commit;
  kb.closedFrame = gui.frame;
  kb.targetId = 0;
}

// src/pages/page.ts
var pages = [];
function registerPage(p) {
  const i = pages.findIndex((x) => x.id === p.id);
  if (i >= 0)
    pages[i] = p;
  else
    pages.push(p);
  pages.sort((a, b) => a.order - b.order);
}
function allPages() {
  return pages;
}

// src/features/feature.ts
var Feature = class {
  description = "";
  category = "General";
  /** remember on/off across sessions */
  persist = true;
  /** show the "settings" expander */
  hasSettings = false;
  /** widget tooltip */
  tooltip = "";
  enabled = false;
  failures = 0;
  onEnable(_ctx) {
  }
  onDisable(_ctx) {
  }
  onUpdate(_dt, _ctx) {
  }
  drawSettings(_ui, _ctx) {
  }
  setEnabled(v, ctx) {
    if (v === this.enabled)
      return;
    this.enabled = v;
    try {
      if (v)
        this.onEnable(ctx);
      else
        this.onDisable(ctx);
    } catch (e) {
      log.error(`feature ${this.id} ${v ? "enable" : "disable"} failed`, e);
      this.enabled = false;
    }
    if (this.persist)
      setState(`feature.${this.id}.enabled`, this.enabled);
  }
  toggle(ctx) {
    this.setEnabled(!this.enabled, ctx);
  }
  /** @internal */
  _update(dt, ctx) {
    if (!this.enabled)
      return;
    try {
      this.onUpdate(dt, ctx);
      this.failures = 0;
    } catch (e) {
      if (++this.failures > 30) {
        log.error(`feature ${this.id} disabled after repeated errors: ${describe(e)}`);
        this.setEnabled(false, ctx);
      }
    }
  }
  /** persisted per-feature value helpers */
  get(key, def) {
    return getState(`feature.${this.id}.${key}`, def);
  }
  set(key, value) {
    setState(`feature.${this.id}.${key}`, value);
  }
};
var features = [];
var featureRegistry = {
  all() {
    return features;
  },
  register(f) {
    const i = features.findIndex((x) => x.id === f.id);
    if (i >= 0)
      features[i] = f;
    else
      features.push(f);
  },
  find(id) {
    return features.find((f) => f.id === id);
  },
  categories() {
    const seen = [];
    for (const f of features)
      if (!seen.includes(f.category))
        seen.push(f.category);
    return seen;
  },
  byCategory(c) {
    return features.filter((f) => f.category === c);
  },
  enabledCount() {
    return features.filter((f) => f.enabled).length;
  },
  update(dt, ctx) {
    for (const f of features)
      f._update(dt, ctx);
  },
  /** Re-applies persisted on/off states (call once after settings are loaded and the menu exists). */
  restore(ctx) {
    for (const f of features) {
      if (f.persist && getState(`feature.${f.id}.enabled`, false))
        f.setEnabled(true, ctx);
    }
  },
  disableAll(ctx) {
    for (const f of features)
      f.setEnabled(false, ctx);
  }
};

// src/pages/features.ts
var openSettings = /* @__PURE__ */ new Set();
function drawFeatureCategory(ctx, category) {
  const ui = ctx.ui;
  const list = featureRegistry.byCategory(category);
  ui.header(category);
  if (list.length === 0) {
    ui.textDim("No features in this category yet.");
    return;
  }
  for (const f of list) {
    ui.pushId(f.id);
    const open = openSettings.has(f.id);
    ui.featureRow(f.name, f.enabled, f.hasSettings, open, (v) => f.setEnabled(v, ctx), () => {
      if (open)
        openSettings.delete(f.id);
      else
        openSettings.add(f.id);
    });
    if (f.description)
      ui.tooltip(f.description);
    if (f.hasSettings && open) {
      ui.indent(12);
      ui.beginCard();
      f.drawSettings(ui, ctx);
      ui.endCard();
      ui.unindent(12);
    }
    ui.popId();
  }
  ui.spacing(6);
  ui.setNextWidth(150);
  if (ui.button("Disable all##cat", { variant: "danger", small: true }))
    for (const f of list)
      f.setEnabled(false, ctx);
}

// src/ui/menu.ts
var W = PANEL.width;
var H = PANEL.height;
var TH = PANEL.titleHeight;
var SW = PANEL.sidebarWidth;
var FH = PANEL.footerHeight;
var PAD = PANEL.padding;
var VX = SW + 1;
var VY = TH;
var VW = W - SW - 1;
var VH = H - TH - FH;
var Menu = class {
  input = new XRInput();
  rig = new Rig();
  pointer = new PointerSource();
  gui;
  built = false;
  fatal = false;
  buildAttempts = 0;
  nextBuildTry = 0;
  root = null;
  panelGo;
  panelT;
  panelGroup;
  chrome;
  layers;
  hud = null;
  visible = false;
  openT = 0;
  panelActive = false;
  lastScale = -1;
  pos = { x: 0, y: 0, z: 0 };
  rot = { ...Q_IDENTITY };
  poseInit = false;
  view = null;
  scrolls = /* @__PURE__ */ new Map();
  fpsEma = 72;
  startedAt = Date.now() / 1e3;
  openedAt = 0;
  palmTimer = 0;
  holdGrace = 0;
  lastHover = 0;
  lastPtr = { valid: false, x: 0, y: 0, down: false, pressed: false, released: false, depth: 0 };
  now = 0;
  dt = 1 / 72;
  pageError = "";
  ctx;
  constructor() {
    this.gui = new Gui({
      settings,
      input: this.input,
      haptic: (kind) => {
        if (!settings.haptics)
          return;
        const hand = settings.hand === "left" ? "right" : "left";
        if (kind === "hover") {
          if (this.now - this.lastHover < 0.05)
            return;
          this.lastHover = this.now;
          this.input.vibrate(hand, 0.12, 0.01);
        } else
          this.input.vibrate(hand, 0.5, 0.03);
      }
    });
    const self = this;
    const actions = {
      close: () => self.setVisible(false),
      goTo: (id) => {
        if (id.startsWith("cat:")) {
          self.view = { kind: "cat", name: id.slice(4) };
          return;
        }
        if (allPages().some((p) => p.id === id))
          self.view = { kind: "page", id };
      },
      unload: () => self.unload(),
      rebuild: () => self.rebuild(),
      get pageCount() {
        return allPages().length + featureRegistry.categories().length;
      },
      get openedAt() {
        return self.openedAt;
      },
      get fps() {
        return self.fpsEma;
      },
      get frameHook() {
        return frameHookName();
      },
      get exportStrategy() {
        return currentExportStrategy();
      },
      get textBackend() {
        return textBackend.kind;
      },
      get pointerDepth() {
        return self.lastPtr.valid ? self.lastPtr.depth : 0;
      },
      get startedAt() {
        return self.startedAt;
      }
    };
    this.ctx = {
      ui: this.gui,
      settings,
      input: this.input,
      rig: this.rig,
      notify: Notify,
      menu: actions,
      get now() {
        return self.now;
      },
      get dt() {
        return self.dt;
      }
    };
  }
  /** Installs the frame hook; the UI itself is built on the first frame (Unity main thread). */
  start() {
    onFrame((dt, now) => this.frame(dt, now));
    if (!installFrameHook())
      this.fatal = true;
  }
  // ── build ───────────────────────────────────────────────────────────────
  tryBuild(now) {
    if (now < this.nextBuildTry)
      return;
    try {
      loadSettings();
      applyTheme(settings.theme);
      this.build();
      this.built = true;
      featureRegistry.restore(this.ctx);
      log.ok(`menu built (${allPages().length} pages, ${featureRegistry.all().length} features) \u2014 open with ${settings.openMode === "palm" ? "palm gesture" : settings.openButton}`);
      Notify.success(`${MENU_INFO.name} ready`, `${settings.openMode === "palm" ? "turn your palm toward you" : "press " + settings.openButton} to open`);
    } catch (e) {
      this.buildAttempts++;
      this.nextBuildTry = now + 3;
      log.error(`menu build failed (attempt ${this.buildAttempts})`, e);
      if (this.buildAttempts >= 6) {
        this.fatal = true;
        log.error("giving up \u2014 check the errors above");
      }
    }
  }
  build() {
    initTextBackend();
    Sprites.warmup([theme.radius, theme.radius - 4, theme.widgetRadius, 11, 8, 6, 3, 2]);
    const root = newGameObject("ACMenu");
    dontDestroyOnLoad(root);
    this.root = root;
    const rootT = transformOf(root);
    const panelGo = newGameObject("Panel", rootT);
    const canvas = addComponent(panelGo, UE.Canvas);
    canvas.method("set_renderMode").invoke(
      2
      /* WorldSpace */
    );
    canvas.method("set_sortingOrder").invoke(3e4);
    const scaler = addComponent(panelGo, UE.CanvasScaler);
    scaler.method("set_dynamicPixelsPerUnit").invoke(3);
    const panelRt = getComponent(panelGo, UE.RectTransform);
    rtSetSizeDelta(panelRt, W, H);
    rtSetPivot(panelRt, 0.5, 0.5);
    this.panelGroup = addCanvasGroup(panelGo);
    this.panelGo = panelGo;
    this.panelT = transformOf(panelGo);
    const P = this.panelT;
    const img = (name, parent, sprite, c = theme.bg, sliced = true) => {
      const e = createImage(parent, name, sprite, c, sliced);
      initTopLeft(e);
      return e;
    };
    const rect2 = (name, parent, x, y, w, h) => {
      const e = createRect(parent, name);
      initTopLeft(e);
      place(e, x, y, w, h);
      return e;
    };
    const shadow = img("Shadow", P, Sprites.shadow(theme.radius, 22), theme.shadow);
    place(shadow, -18, -14, W + 36, H + 40);
    const bg = img("Bg", P, Sprites.rounded(theme.radius), theme.bg);
    place(bg, 0, 0, W, H);
    const titleClip = rect2("TitleClip", P, 0, 0, W, TH);
    addMask(titleClip.go);
    const titleBg = img("TitleBg", transformOf(titleClip.go), Sprites.rounded(theme.radius), theme.titleBg);
    place(titleBg, 0, 0, W, H);
    const titleLine = img("TitleLine", P, Sprites.gradientH(), theme.accent, false);
    place(titleLine, 0, TH - 1, W, 1);
    const sidebarBg = img("SidebarBg", P, Sprites.white(), theme.sidebarBg, false);
    place(sidebarBg, 0, TH, SW, VH);
    const sidebar = rect2("Sidebar", P, 0, TH, SW, VH);
    const divider = img("Divider", P, Sprites.white(), theme.border, false);
    place(divider, SW, TH + 12, 1, VH - 24);
    const viewport = rect2("Viewport", P, VX, VY, VW, VH);
    addMask(viewport.go);
    const content = rect2("Content", transformOf(viewport.go), 0, 0, VW, 10);
    const footer = rect2("Footer", P, 0, H - FH, W, FH);
    const footerLine = img("FooterLine", P, Sprites.white(), theme.border, false);
    place(footerLine, 14, H - FH, W - 28, 1);
    const scrollTrack = img("ScrollTrack", P, Sprites.rounded(2), theme.track);
    place(scrollTrack, W - 8, VY + 8, 3, VH - 16);
    const scrollThumb = img("ScrollThumb", P, Sprites.rounded(2), theme.accent);
    place(scrollThumb, W - 8, VY + 8, 3, 40);
    const statusDot = img("StatusDot", P, Sprites.circle(), theme.success, false);
    place(statusDot, 16, H - FH + 9, 8, 8);
    const title = rect2("Title", P, 0, 0, W, TH);
    const border = img("Border", P, Sprites.ring(theme.radius, 1), theme.border);
    place(border, 0, 0, W, H);
    const overlay = rect2("Overlay", P, 0, 0, W, H);
    this.chrome = { shadow, bg, border, titleClip, titleBg, titleLine, divider, footerLine, scrollTrack, scrollThumb, statusDot, sidebarBg };
    this.layers = {
      title: transformOf(title.go),
      sidebar: transformOf(sidebar.go),
      content: transformOf(content.go),
      footer: transformOf(footer.go),
      overlay: transformOf(overlay.go)
    };
    this.buildHud(rootT);
    setActive(panelGo, false);
    this.panelActive = false;
    this.gui.reset();
  }
  buildHud(rootT) {
    try {
      const go = newGameObject("WristHud", rootT);
      const canvas = addComponent(go, UE.Canvas);
      canvas.method("set_renderMode").invoke(2);
      canvas.method("set_sortingOrder").invoke(3e4);
      const scaler = addComponent(go, UE.CanvasScaler);
      scaler.method("set_dynamicPixelsPerUnit").invoke(3);
      const rt = getComponent(go, UE.RectTransform);
      rtSetSizeDelta(rt, 220, 64);
      rtSetPivot(rt, 0.5, 0.5);
      const t = transformOf(go);
      const group = addCanvasGroup(go);
      const bg = createImage(t, "Bg", Sprites.rounded(14), theme.bg);
      initTopLeft(bg);
      place(bg, 0, 0, 220, 64);
      const border = createImage(t, "Border", Sprites.ring(14, 1), theme.border);
      initTopLeft(border);
      place(border, 0, 0, 220, 64);
      const time = createText(t, "Time", "", 22, theme.text, "center", "middle", true);
      initTopLeft(time);
      place(time, 0, 4, 220, 34);
      const info = createText(t, "Info", "", 11, theme.textDim, "center", "middle");
      initTopLeft(info);
      place(info, 0, 36, 220, 22);
      setLocalScale(t, { x: PANEL.metersPerUnit, y: PANEL.metersPerUnit, z: PANEL.metersPerUnit });
      setActive(go, false);
      this.hud = { go, t, group, bg, border, time, info, shown: false };
    } catch (e) {
      log.warn(`wrist HUD disabled: ${describe(e)}`);
      this.hud = null;
    }
  }
  // ── frame ───────────────────────────────────────────────────────────────
  frame(dt, now) {
    if (this.fatal)
      return;
    this.now = now;
    this.dt = dt;
    if (!this.built) {
      this.tryBuild(now);
      if (!this.built)
        return;
    }
    this.input.poll(now);
    this.rig.resolve(now);
    this.fpsEma = lerp(this.fpsEma, 1 / Math.max(dt, 1e-3), 0.05);
    Notify.now = now;
    featureRegistry.update(dt, this.ctx);
    this.handleOpenInput(dt);
    this.updateHud();
    const target = this.visible ? 1 : 0;
    this.openT = lerp(this.openT, target, damp(target ? 11 : 16, dt));
    if (!this.visible && this.openT < 0.02) {
      if (this.panelActive) {
        setActive(this.panelGo, false);
        this.panelActive = false;
      }
      this.openT = 0;
      return;
    }
    if (!this.panelActive) {
      setActive(this.panelGo, true);
      this.panelActive = true;
    }
    this.follow(dt);
    const mpu = PANEL.metersPerUnit * settings.scale;
    const s = Math.max(5e-4, mpu * easeOutBack(this.openT));
    if (Math.abs(s - this.lastScale) > 1e-6) {
      setLocalScale(this.panelT, { x: s, y: s, z: s });
      this.lastScale = s;
    }
    groupSetAlpha(this.panelGroup, clamp01(this.openT * 1.6));
    const interactive = this.openT > 0.85 && this.visible;
    const ptr2 = this.pointer.compute(settings, this.input, this.rig, { pos: this.pos, rot: this.rot, mpu, width: W, height: H }, interactive);
    this.lastPtr = ptr2;
    const gui = this.gui;
    gui.pointerBlocked = gui.keyboard.open;
    gui.beginFrame(ptr2, dt, now);
    this.drawTitle();
    this.drawSidebar();
    this.drawContent(dt);
    this.drawFooter();
    this.drawOverlay(ptr2);
    gui.endFrame();
    this.styleChrome();
    flushIfDirty();
  }
  styleChrome() {
    const c = this.chrome;
    imageSetColor(c.bg, theme.bg);
    imageSetColor(c.titleBg, theme.titleBg);
    imageSetColor(c.border, theme.border);
    imageSetSprite(c.titleLine, theme.flat ? Sprites.white() : Sprites.gradientH(), false);
    imageSetColor(c.titleLine, theme.flat ? theme.border : theme.accent);
    imageSetColor(c.divider, theme.border);
    imageSetColor(c.footerLine, theme.border);
    imageSetColor(c.shadow, theme.shadow);
    imageSetColor(c.scrollTrack, theme.track);
    imageSetColor(c.statusDot, this.rig.resolved ? theme.success : theme.warning);
    imageSetColor(c.sidebarBg, theme.flat ? theme.sidebarBg : { ...theme.sidebarBg, a: 0 });
  }
  // ── open / close ────────────────────────────────────────────────────────
  setVisible(v) {
    if (v === this.visible)
      return;
    this.visible = v;
    if (v) {
      this.openedAt = this.now;
      this.poseInit = false;
    } else {
      this.gui.keyboard.open = false;
      saveSettings();
    }
  }
  handleOpenInput(dt) {
    const inp = this.input;
    switch (settings.openMode) {
      case "toggle":
        if (inp.wasPressed(settings.openButton))
          this.setVisible(!this.visible);
        break;
      case "hold":
        if (inp.isDown(settings.openButton)) {
          this.holdGrace = 0.15;
          this.setVisible(true);
        } else {
          this.holdGrace -= dt;
          if (this.holdGrace <= 0)
            this.setVisible(false);
        }
        break;
      case "palm": {
        const hand = this.rig.pose(settings.hand), head = this.rig.pose("head");
        if (hand.valid && head.valid) {
          const palm = qrot(hand.rot, settings.hand === "left" ? V3_RIGHT : mul(V3_RIGHT, -1));
          const facing = dot(palm, normalize(sub(head.pos, hand.pos)));
          this.palmTimer = clamp(this.palmTimer + (facing > settings.palmThreshold ? dt : -dt), 0, 0.6);
          if (!this.visible && this.palmTimer > 0.2)
            this.setVisible(true);
          if (this.visible && this.palmTimer <= 0)
            this.setVisible(false);
        }
        if (inp.desktop && inp.wasPressed(settings.openButton))
          this.setVisible(!this.visible);
        break;
      }
    }
  }
  // ── hand following ──────────────────────────────────────────────────────
  targetPose() {
    const hand = this.rig.pose(settings.hand);
    if (!hand.valid) {
      const head2 = this.rig.pose("head");
      if (!head2.valid)
        return null;
      const fwd = qforward(head2.rot);
      const pos2 = add(head2.pos, mul(fwd, 0.6));
      return { pos: pos2, rot: qlook(fwd, V3_UP) };
    }
    const head = this.rig.pose("head");
    const off = settings.offset;
    if (settings.followMode === "float") {
      const headPos = head.valid ? head.pos : add(hand.pos, { x: 0, y: 0.3, z: -0.5 });
      let toHead = sub(headPos, hand.pos);
      toHead = { x: toHead.x, y: 0, z: toHead.z };
      const fwd = length(toHead) > 1e-3 ? normalize(toHead) : qforward(hand.rot);
      const right = normalize(cross(V3_UP, fwd));
      const pos2 = add(add(add(hand.pos, mul(right, off.x)), mul(V3_UP, off.y)), mul(fwd, off.z));
      const away = normalize(sub(pos2, headPos));
      return { pos: pos2, rot: qlook(length(away) > 1e-3 ? away : fwd, V3_UP) };
    }
    const pos = add(hand.pos, qrot(hand.rot, { x: off.x, y: off.y, z: off.z }));
    const base = qlook(settings.hand === "left" ? { x: -1, y: 0, z: 0 } : { x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 1 });
    const ro = settings.rotationOffset;
    const rot = qmul(qmul(hand.rot, qeuler(ro.x, ro.y, ro.z)), base);
    return { pos, rot };
  }
  follow(dt) {
    const t = this.targetPose();
    if (!t)
      return;
    if (!this.poseInit) {
      this.pos = t.pos;
      this.rot = t.rot;
      this.poseInit = true;
    } else {
      const k = damp(lerp(45, 7, settings.smoothing), dt);
      this.pos = lerpV3(this.pos, t.pos, k);
      this.rot = qnlerp(this.rot, t.rot, k);
    }
    setPosition(this.panelT, this.pos);
    setRotation(this.panelT, this.rot);
  }
  updateHud() {
    const h = this.hud;
    if (!h)
      return;
    const show = settings.wristHud && !this.visible && this.openT < 0.05 && this.rig.resolved;
    if (show !== h.shown) {
      setActive(h.go, show);
      h.shown = show;
    }
    if (!show)
      return;
    const hand = this.rig.pose(settings.hand), head = this.rig.pose("head");
    if (!hand.valid)
      return;
    const pos = add(hand.pos, mul(V3_UP, 0.05));
    const away = head.valid ? normalize(sub(pos, head.pos)) : qforward(hand.rot);
    setPosition(h.t, pos);
    setRotation(h.t, qlook(away, V3_UP));
    const palm = qrot(hand.rot, settings.hand === "left" ? V3_RIGHT : mul(V3_RIGHT, -1));
    const facing = head.valid ? dot(palm, normalize(sub(head.pos, hand.pos))) : 0;
    groupSetAlpha(h.group, clamp01(0.25 + facing));
    textSet(h.time, clock());
    textSet(h.info, `${settings.showFps ? Math.round(this.fpsEma) + " fps \xB7 " : ""}${settings.openMode === "palm" ? "palm up to open" : settings.openButton + " opens menu"}`);
    imageSetColor(h.bg, theme.bg);
    imageSetColor(h.border, theme.border);
    textSetColor(h.time, theme.text);
    textSetColor(h.info, theme.textDim);
  }
  // ── views ───────────────────────────────────────────────────────────────
  /** Everything the sidebar lists, in order: feature categories, then pages. */
  entries() {
    const out = [];
    for (const c of featureRegistry.categories())
      out.push({ view: { kind: "cat", name: c }, title: c, icon: "" });
    for (const p of allPages())
      out.push({ view: { kind: "page", id: p.id }, title: p.title, icon: p.icon });
    return out;
  }
  sameView(a, b) {
    return !!a && a.kind === b.kind && (a.kind === "cat" ? a.name === b.name : a.id === b.id);
  }
  currentView() {
    const all = this.entries();
    if (all.length === 0)
      return null;
    if (!this.view || !all.some((e) => this.sameView(this.view, e.view)))
      this.view = all[0].view;
    return this.view;
  }
  viewKey(v) {
    return v.kind === "cat" ? `cat:${v.name}` : `page:${v.id}`;
  }
  viewTitle(v) {
    return v.kind === "cat" ? v.name : allPages().find((p) => p.id === v.id)?.title ?? v.id;
  }
  // ── drawing ─────────────────────────────────────────────────────────────
  drawTitle() {
    const gui = this.gui;
    gui.beginLayer("title", this.layers.title, 0, 0, W, { x: 0, y: 0, w: W, h: TH });
    gui.setCursor(16, 7);
    gui.setNextWidth(260);
    gui.label(`<b>${MENU_INFO.name}</b>  <size=11><color=${toHex(theme.accent2)}>${MENU_INFO.tagline}</color></size>`, { size: theme.titleSize, height: 32 });
    let x = W - 44;
    if (settings.showFps) {
      x -= 58;
      gui.setCursor(x, 7);
      gui.setNextWidth(56);
      gui.label(`${Math.round(this.fpsEma)} <size=10>FPS</size>`, { size: theme.smallFontSize, color: theme.textDim, align: "right", height: 32 });
    }
    if (settings.showClock) {
      x -= 60;
      gui.setCursor(x, 7);
      gui.setNextWidth(56);
      gui.label(clock(), { size: theme.smallFontSize + 1, color: theme.textDim, align: "right", height: 32, bold: true });
    }
    gui.setCursor(W - 40, 8);
    if (gui.iconButton("close", "close", 30))
      this.setVisible(false);
    gui.endLayer();
  }
  drawSidebar() {
    const gui = this.gui;
    const cur = this.currentView();
    gui.beginLayer("sidebar", this.layers.sidebar, 0, TH, SW, { x: 0, y: TH, w: SW, h: VH });
    gui.setCursor(8, 8);
    gui.setRightEdge(SW - 8);
    let lastKind = null;
    for (const e of this.entries()) {
      if (lastKind && lastKind !== e.view.kind)
        gui.separator();
      lastKind = e.view.kind;
      if (gui.sidebarItem(e.title, this.sameView(cur, e.view), theme.flat ? "" : e.icon))
        this.view = e.view;
    }
    gui.setCursor(8, VH - 26);
    gui.setNextWidth(SW - 16);
    gui.label(`${settings.hand === "left" ? "L" : "R"} hand \xB7 ${settings.pointerMode}`, { size: theme.smallFontSize - 1, color: theme.textMuted, align: "center", height: 20 });
    gui.endLayer();
  }
  drawContent(dt) {
    const gui = this.gui;
    const view = this.currentView();
    if (!view)
      return;
    const key = this.viewKey(view);
    let sc = this.scrolls.get(key);
    if (!sc) {
      sc = newScroll();
      this.scrolls.set(key, sc);
    }
    const stick = this.input.stick(settings.hand === "left" ? "right" : "left");
    if (Math.abs(stick.y) > 0.25)
      gui.scrollBy(sc, -stick.y * 800 * dt);
    gui.beginLayer(`content:${key}`, this.layers.content, VX, VY, VW, { x: VX, y: VY, w: VW, h: VH }, sc);
    gui.setCursor(PAD, PAD);
    gui.setRightEdge(VW - PAD - 8);
    gui.pushId(key);
    try {
      if (view.kind === "cat")
        drawFeatureCategory(this.ctx, view.name);
      else
        allPages().find((p) => p.id === view.id)?.draw(this.ctx);
      this.pageError = "";
    } catch (e) {
      const msg = describe(e);
      if (msg !== this.pageError) {
        this.pageError = msg;
        log.error(`view "${key}" threw`, e);
      }
      gui.text(`page error: ${msg.split("\n")[0]}`, theme.danger);
    }
    gui.popId();
    gui.spacing(PAD);
    gui.endLayer();
    const c = this.chrome;
    if (sc.contentH > sc.viewH + 1) {
      const trackH = VH - 16;
      const thumbH = Math.max(24, trackH * sc.viewH / sc.contentH);
      const y = VY + 8 + (trackH - thumbH) * clamp01(sc.scroll / Math.max(1, sc.contentH - sc.viewH));
      setVisible(c.scrollTrack, true);
      setVisible(c.scrollThumb, true);
      place(c.scrollThumb, W - 8, y, 3, thumbH);
      imageSetColor(c.scrollThumb, sc.dragging || Math.abs(sc.velocity) > 1 ? theme.accent2 : theme.accent);
    } else {
      setVisible(c.scrollTrack, false);
      setVisible(c.scrollThumb, false);
    }
  }
  drawFooter() {
    const gui = this.gui;
    const view = this.currentView();
    const all = this.entries();
    const idx = view ? all.findIndex((e) => this.sameView(view, e.view)) : -1;
    gui.beginLayer("footer", this.layers.footer, 0, H - FH, W, { x: 0, y: H - FH, w: W, h: FH });
    gui.setCursor(30, 2);
    gui.setNextWidth(200);
    gui.label(this.rig.resolved ? this.rig.source : "waiting for player\u2026", { size: theme.smallFontSize - 1, color: theme.textMuted, height: 22 });
    gui.setCursor(W / 2 - 80, 2);
    gui.setNextWidth(160);
    gui.label(this.input.desktop ? "keyboard mode" : `pointer: ${settings.pointerMode}`, { size: theme.smallFontSize - 1, color: theme.textMuted, align: "center", height: 22 });
    gui.setCursor(W - 160, 2);
    gui.setNextWidth(146);
    gui.label(`${view ? this.viewTitle(view) : ""}  ${idx + 1}/${all.length}`, { size: theme.smallFontSize - 1, color: theme.textMuted, align: "right", height: 22 });
    gui.endLayer();
  }
  drawOverlay(ptr2) {
    const gui = this.gui;
    gui.beginLayer("overlay", this.layers.overlay, 0, 0, W, { x: 0, y: 0, w: W, h: H }, null, true);
    Notify.draw(gui, W - 14, TH + 10, 250, this.now);
    const tt = gui.tooltipReq;
    if (tt) {
      const tw = Math.min(260, tt.text.length * 8 + 24);
      const x = clamp(tt.rect.x + tt.rect.w / 2 - tw / 2, 8, W - tw - 8);
      const y = tt.rect.y - 36 < TH ? tt.rect.y + tt.rect.h + 4 : tt.rect.y - 36;
      gui.tooltipBubble(tt.text, x, y, tw);
    }
    drawKeyboard(gui, W, H);
    if (ptr2.valid) {
      const finger = settings.pointerMode === "finger" && !this.input.desktop;
      const size = finger ? clamp(7 + -ptr2.depth * 140, 7, 22) : 9;
      gui.cursor(ptr2.x, ptr2.y, size, ptr2.down ? 1 : 0.85);
    }
    gui.endLayer();
  }
  // ── lifecycle ──────────────────────────────────────────────────────────
  rebuild() {
    log.info("rebuilding menu\u2026");
    try {
      this.gui.reset();
    } catch {
    }
    if (this.root) {
      destroy(this.root);
      this.root = null;
    }
    this.built = false;
    this.nextBuildTry = 0;
    this.buildAttempts = 0;
    this.hud = null;
    this.lastScale = -1;
  }
  unload() {
    log.info("unloading menu\u2026");
    try {
      saveSettings();
    } catch {
    }
    try {
      featureRegistry.disableAll(this.ctx);
    } catch {
    }
    removeFrameHook();
    try {
      this.gui.reset();
    } catch {
    }
    this.pointer.destroy();
    if (this.root) {
      destroy(this.root);
      this.root = null;
    }
    this.built = false;
    this.fatal = true;
    log.ok("menu unloaded \u2014 detach Frida or re-run the script to load again");
  }
};
function clock() {
  const d = /* @__PURE__ */ new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// src/pages/settings.ts
var dirty2 = () => markDirty();
registerPage({
  id: "settings",
  title: "Settings",
  icon: "S",
  order: 30,
  draw(ctx) {
    const ui = ctx.ui;
    ui.header("Settings");
    if (ui.collapsingHeader("Hand & position", true)) {
      ui.indent(6);
      ui.tabs("hand", settings.hand === "left" ? 0 : 1, ["Left hand", "Right hand"], (i) => {
        settings.hand = i === 0 ? "left" : "right";
        dirty2();
      });
      ui.tooltip("The other hand becomes the pointer");
      const modes = ["float", "locked"];
      ui.dropdown("Follow mode", modes.indexOf(settings.followMode), ["Float (faces you)", "Locked to hand"], (i) => {
        settings.followMode = modes[i];
        dirty2();
      });
      ui.slider("Size", settings.scale, 0.5, 2, { step: 0.05, onChange: (v) => {
        settings.scale = v;
        dirty2();
      }, suffix: "x" });
      ui.slider("Smoothing", settings.smoothing, 0, 1, { step: 0.05, onChange: (v) => {
        settings.smoothing = v;
        dirty2();
      } });
      ui.beginCard("offset (cm)");
      ui.slider("Right / left", settings.offset.x * 100, -30, 30, { step: 0.5, onChange: (v) => {
        settings.offset.x = v / 100;
        dirty2();
      } });
      ui.slider("Up / down", settings.offset.y * 100, -30, 30, { step: 0.5, onChange: (v) => {
        settings.offset.y = v / 100;
        dirty2();
      } });
      ui.slider("Toward you", settings.offset.z * 100, -30, 30, { step: 0.5, onChange: (v) => {
        settings.offset.z = v / 100;
        dirty2();
      } });
      ui.endCard();
      if (settings.followMode === "locked") {
        ui.beginCard("rotation (deg)");
        ui.slider("Tilt X", settings.rotationOffset.x, -180, 180, { step: 5, onChange: (v) => {
          settings.rotationOffset.x = v;
          dirty2();
        } });
        ui.slider("Turn Y", settings.rotationOffset.y, -180, 180, { step: 5, onChange: (v) => {
          settings.rotationOffset.y = v;
          dirty2();
        } });
        ui.slider("Roll Z", settings.rotationOffset.z, -180, 180, { step: 5, onChange: (v) => {
          settings.rotationOffset.z = v;
          dirty2();
        } });
        ui.endCard();
      }
      if (ui.button("Reset position", { small: true, variant: "ghost" })) {
        settings.offset = { ...DEFAULT_SETTINGS.offset };
        settings.rotationOffset = { ...DEFAULT_SETTINGS.rotationOffset };
        settings.scale = 1;
        dirty2();
      }
      ui.unindent(6);
    }
    if (ui.collapsingHeader("Opening the menu", true)) {
      ui.indent(6);
      const om = ["toggle", "hold", "palm"];
      ui.dropdown("Open mode", om.indexOf(settings.openMode), ["Press button to toggle", "Hold button", "Palm facing you"], (i) => {
        settings.openMode = om[i];
        dirty2();
      });
      if (settings.openMode !== "palm")
        ui.keybind("Open button", settings.openButton, (b) => {
          settings.openButton = b;
          dirty2();
        });
      else
        ui.slider("Palm sensitivity", settings.palmThreshold, 0.3, 0.9, { step: 0.05, onChange: (v) => {
          settings.palmThreshold = v;
          dirty2();
        } });
      ui.unindent(6);
    }
    if (ui.collapsingHeader("Pointer", true)) {
      ui.indent(6);
      const pm = ["finger", "laser", "gaze"];
      ui.dropdown("Pointer", pm.indexOf(settings.pointerMode), ["Finger (touch)", "Laser (button)", "Gaze (head)"], (i) => {
        settings.pointerMode = pm[i];
        dirty2();
      });
      if (settings.pointerMode === "finger") {
        ui.beginCard("finger tip offset (cm)");
        ui.slider("Sideways", settings.fingerOffset.x * 100, -10, 10, { step: 0.25, onChange: (v) => {
          settings.fingerOffset.x = v / 100;
          dirty2();
        } });
        ui.slider("Up / down", settings.fingerOffset.y * 100, -10, 10, { step: 0.25, onChange: (v) => {
          settings.fingerOffset.y = v / 100;
          dirty2();
        } });
        ui.slider("Forward", settings.fingerOffset.z * 100, -10, 15, { step: 0.25, onChange: (v) => {
          settings.fingerOffset.z = v / 100;
          dirty2();
        } });
        ui.keyValue("Finger depth now", ctx.menu.pointerDepth === 0 ? "\u2014" : `${(ctx.menu.pointerDepth * 100).toFixed(1)} cm`);
        ui.endCard();
      }
      if (settings.pointerMode === "laser")
        ui.keybind("Laser click", settings.laserButton, (b) => {
          settings.laserButton = b;
          dirty2();
        });
      ui.toggle("Click on press", settings.clickOnPress, (v) => {
        settings.clickOnPress = v;
        dirty2();
      }, { description: "Fire when the finger enters instead of when it leaves" });
      ui.toggle("Haptics", settings.haptics, (v) => {
        settings.haptics = v;
        dirty2();
      });
      ui.unindent(6);
    }
    if (ui.collapsingHeader("Appearance", true)) {
      ui.indent(6);
      const names = themeNames();
      ui.dropdown("Theme", Math.max(0, names.indexOf(settings.theme)), names, (i) => {
        settings.theme = names[i];
        applyTheme(names[i]);
        dirty2();
      });
      const ts = ["checkbox", "checkbox-left", "switch"];
      ui.dropdown("Checkbox side", Math.max(0, ts.indexOf(settings.toggleStyle)), ["Right", "Left", "Switch style"], (i) => {
        settings.toggleStyle = ts[i];
        dirty2();
      });
      ui.slider("Tooltip delay", settings.tooltipDelay, 0.1, 2, { step: 0.1, onChange: (v) => {
        settings.tooltipDelay = v;
        dirty2();
      }, suffix: " s" });
      ui.toggle("Show FPS", settings.showFps, (v) => {
        settings.showFps = v;
        dirty2();
      });
      ui.toggle("Show clock", settings.showClock, (v) => {
        settings.showClock = v;
        dirty2();
      });
      ui.toggle("Wrist HUD", settings.wristHud, (v) => {
        settings.wristHud = v;
        dirty2();
      }, { description: "Small clock/fps panel on the hand while the menu is closed" });
      ui.unindent(6);
    }
    ui.separator("danger zone");
    ui.beginColumns(3);
    if (ui.button("Save now", { variant: "primary" })) {
      saveSettings();
      ctx.notify.success("Saved");
    }
    ui.nextColumn();
    if (ui.button("Reset all", { variant: "danger" })) {
      resetSettings();
      applyTheme(settings.theme);
      ctx.notify.warn("Settings reset");
    }
    ui.nextColumn();
    if (ui.button("Unload menu", { variant: "danger" }))
      ctx.menu.unload();
    ui.endColumns();
    ui.textDim(`bindings: ${ALL_BUTTONS.filter((b) => b !== "none").map((b) => BUTTON_LABELS[b]).join(" \xB7 ")}`);
    ui.label(" ", { color: theme.textMuted });
  }
});

// src/pages/theme.ts
var previewToggle = true;
var previewSlider = 6;
registerPage({
  id: "theme",
  title: "Theme",
  icon: "T",
  order: 40,
  draw(ctx) {
    const ui = ctx.ui;
    ui.header("Theme");
    const names = themeNames();
    const cur = Math.max(0, THEMES.findIndex((t) => t.name === theme.name));
    ui.tabs("presets", cur, names, (i) => {
      applyTheme(names[i]);
      settings.theme = names[i];
      markDirty();
    });
    ui.spacing(2);
    const pick = (label, key) => {
      const c = theme[key];
      ui.colorPicker(label, c, (v) => {
        theme[key] = v;
        bumpTheme();
      });
    };
    if (ui.collapsingHeader("Colors", true)) {
      ui.indent(6);
      pick("Accent", "accent");
      pick("Accent 2", "accent2");
      pick("Background", "bg");
      pick("Surface", "surface");
      pick("Surface 2", "surface2");
      pick("Border", "border");
      pick("Text", "text");
      pick("Text dim", "textDim");
      ui.unindent(6);
    }
    if (ui.collapsingHeader("Shape")) {
      ui.indent(6);
      ui.slider("Corner radius", theme.radius, 4, 28, { step: 1, onChange: (v) => {
        theme.radius = v;
        bumpTheme();
      } });
      ui.slider("Widget radius", theme.widgetRadius, 2, 17, { step: 1, onChange: (v) => {
        theme.widgetRadius = v;
        bumpTheme();
      } });
      ui.slider("Glow", theme.glow, 0, 1.5, { step: 0.05, onChange: (v) => {
        theme.glow = v;
        bumpTheme();
      } });
      ui.slider("Font size", theme.fontSize, 12, 20, { step: 1, onChange: (v) => {
        theme.fontSize = v;
        bumpTheme();
      } });
      ui.unindent(6);
    }
    ui.separator("preview");
    ui.beginCard("preview");
    ui.beginColumns(2);
    ui.button("Primary", { variant: "primary" });
    ui.nextColumn();
    ui.button("Default");
    ui.endColumns();
    previewToggle = ui.toggle("Toggle", previewToggle);
    previewSlider = ui.slider("Slider", previewSlider, 0, 10, { step: 1 });
    ui.badge("badge");
    ui.sameLine();
    ui.badge("ok", theme.success);
    ui.sameLine();
    ui.badge("warn", theme.warning);
    ui.endCard();
    if (ui.button("Revert to preset", { variant: "ghost", small: true }))
      applyTheme(theme.name);
  }
});

// src/pages/gallery.ts
var demo = {
  toggleA: true,
  toggleB: false,
  slider: 4.2,
  int: 3,
  drop: 1,
  step: 2,
  tab: 0,
  color: hex("#7c5cff"),
  key: "right.primary",
  text: "",
  tbtn: false,
  progress: 0,
  fr: true,
  frOpen: false,
  fr2: false
};
registerPage({
  id: "gallery",
  title: "Widgets",
  icon: "W",
  order: 20,
  draw(ctx) {
    const ui = ctx.ui;
    demo.progress = (demo.progress + ctx.dt * 0.15) % 1;
    ui.header("Widget gallery");
    ui.textDim("Every widget the template ships, with the call that draws it.");
    ui.separator("text");
    ui.label("ui.label(text)");
    ui.label("bold + colored", { bold: true, color: theme.accent2 });
    ui.textWrapped("ui.textWrapped(): long text wraps to the available width and pushes the layout down like any other widget.");
    ui.keyValue("ui.keyValue(k, v)", "value");
    ui.badge("badge");
    ui.sameLine();
    ui.badge("success", theme.success);
    ui.sameLine();
    ui.badge("danger", theme.danger);
    ui.separator("buttons");
    if (ui.button("ui.button()"))
      ctx.notify.info("Clicked", "default button");
    ui.tooltip("Tooltips appear after hovering a moment");
    ui.beginColumns(3);
    if (ui.button("primary", { variant: "primary" }))
      ctx.notify.success("Primary");
    ui.nextColumn();
    if (ui.button("danger", { variant: "danger" }))
      ctx.notify.error("Danger", "be careful");
    ui.nextColumn();
    if (ui.button("ghost", { variant: "ghost" }))
      ctx.notify.warn("Ghost");
    ui.endColumns();
    demo.tbtn = ui.toggleButton("ui.toggleButton()", demo.tbtn);
    const row = ui.buttonRow(["one", "two", "three"]);
    if (row >= 0)
      ctx.notify.info(`buttonRow \u2192 ${row}`);
    ui.separator("feature rows");
    demo.fr = ui.featureRow("ui.featureRow() with settings", demo.fr, true, demo.frOpen, (v) => demo.fr = v, () => demo.frOpen = !demo.frOpen);
    if (demo.frOpen) {
      ui.indent(12);
      ui.beginCard();
      ui.textDim("feature settings go here");
      ui.endCard();
      ui.unindent(12);
    }
    demo.fr2 = ui.featureRow("ui.featureRow() plain", demo.fr2, false, false, (v) => demo.fr2 = v);
    ui.separator("toggles");
    demo.toggleA = ui.toggle("ui.toggle()", demo.toggleA);
    demo.toggleB = ui.toggle("with description", demo.toggleB, void 0, { description: "opts.description adds a second line" });
    ui.toggle("disabled", true, void 0, { disabled: true });
    ui.separator("sliders");
    demo.slider = ui.slider("ui.slider()", demo.slider, 0, 10, { step: 0.1, suffix: " m" });
    demo.int = ui.intSlider("ui.intSlider()", demo.int, 0, 10, void 0, " px");
    demo.step = ui.stepper("ui.stepper()", demo.step, 0, 10);
    ui.progress(demo.progress, "ui.progress()");
    ui.separator("selection");
    demo.drop = ui.dropdown("ui.dropdown()", demo.drop, ["Alpha", "Beta", "Gamma", "Delta"]);
    demo.tab = ui.tabs("demo", demo.tab, ["Tab A", "Tab B", "Tab C"]);
    demo.color = ui.colorPicker("ui.colorPicker()", demo.color);
    demo.key = ui.keybind("ui.keybind()", demo.key);
    demo.text = ui.textField("ui.textField()", demo.text, "tap to type\u2026");
    ui.separator("layout");
    if (ui.collapsingHeader("ui.collapsingHeader()")) {
      ui.indent();
      ui.textDim("Content inside a collapsing header.");
      ui.beginColumns(2);
      ui.button("col 1");
      ui.nextColumn();
      ui.button("col 2");
      ui.endColumns();
      ui.unindent();
    }
    ui.beginCard("ui.beginCard() / endCard()");
    ui.textDim("Cards group related widgets.");
    ui.label("ui.sameLine() + setNextWidth():");
    ui.setNextWidth(90);
    ui.button("A##sl");
    ui.sameLine();
    ui.setNextWidth(90);
    ui.button("B##sl");
    ui.sameLine();
    ui.button("C fills the rest##sl");
    ui.endCard();
    ui.beginColumns(2);
    ui.statCard("stat card", "42", "ui.statCard()", theme.accent);
    ui.nextColumn();
    ui.statCard("another", "1.2k", "with accent", theme.success);
    ui.endColumns();
    ui.spacing(20);
  }
});

// src/pages/console.ts
var filter = 0;
var FILTERS = ["all", "info", "warn", "error"];
registerPage({
  id: "console",
  title: "Console",
  icon: "C",
  order: 50,
  draw(ctx) {
    const ui = ctx.ui;
    ui.header("Console");
    filter = ui.tabs("logfilter", filter, ["All", "Info", "Warn", "Error"]);
    ui.beginColumns(4);
    if (ui.button("Clear", { small: true }))
      log.clear();
    ui.nextColumn();
    if (ui.button("Info##t", { small: true }))
      ctx.notify.info("Info toast", "ui.notify.info()");
    ui.nextColumn();
    if (ui.button("Warn##t", { small: true }))
      ctx.notify.warn("Warning toast", "something to look at");
    ui.nextColumn();
    if (ui.button("Error##t", { small: true }))
      ctx.notify.error("Error toast", "something broke");
    ui.endColumns();
    ui.beginCard("runtime");
    ui.keyValue("Frame hook", ctx.menu.frameHook);
    ui.keyValue("Export map", ctx.menu.exportStrategy);
    ui.keyValue("Text backend", ctx.menu.textBackend);
    ui.keyValue("Rig source", ctx.rig.source);
    ui.keyValue("Input", ctx.input.desktop ? "keyboard (no XR device)" : "XR InputDevices");
    ui.endCard();
    ui.separator(`log (${logBuffer.length})`);
    const want = FILTERS[filter];
    const lines = logBuffer.filter((e) => want === "all" || e.level === want || want === "info" && e.level === "ok").slice(-60).reverse();
    if (lines.length === 0)
      ui.textDim("nothing here");
    for (let i = 0; i < lines.length; i++) {
      const e = lines[i];
      const c = e.level === "error" ? theme.danger : e.level === "warn" ? theme.warning : e.level === "ok" ? theme.success : e.level === "debug" ? theme.textMuted : theme.textDim;
      const d = new Date(e.time);
      const ts = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
      ui.pushId(i);
      ui.label(`<color=#5c6684>${ts}</color> ${e.msg.split("\n")[0]}`, { color: c, size: theme.smallFontSize + 1 });
      ui.popId();
    }
  }
});

// src/pages/about.ts
registerPage({
  id: "about",
  title: "About",
  icon: "i",
  order: 90,
  draw(ctx) {
    const ui = ctx.ui;
    ui.header(`${MENU_INFO.name}  <size=70%><color=#9aa3bf>v${MENU_INFO.version}</color></size>`);
    ui.textDim(MENU_INFO.tagline);
    ui.beginCard("controls");
    ui.keyValue("Open / close", ctx.settings.openMode === "palm" ? "palm toward face" : "bound button");
    ui.keyValue("Click", ctx.settings.pointerMode === "finger" ? "push finger into panel" : "laser button");
    ui.keyValue("Scroll", "drag empty space / thumbstick");
    ui.keyValue("Tooltip", "hover a moment");
    ui.endCard();
    ui.beginCard("stack");
    ui.keyValue("Injection", "Frida + frida-il2cpp-bridge");
    ui.keyValue("Rendering", "Unity uGUI world-space canvas");
    ui.keyValue("Text", ctx.menu.textBackend);
    ui.keyValue("Unity", safe(() => Il2Cpp.unityVersion));
    ui.keyValue("App", safe(() => `${Il2Cpp.application.identifier} ${Il2Cpp.application.version}`));
    ui.endCard();
    ui.textWrapped("Template only: it contains no game modifications. Add your own features in src/features/ and pages in src/pages/.", theme.textMuted);
    ui.label(`by ${MENU_INFO.author}`, { color: theme.textMuted, align: "right" });
  }
});
function safe(f) {
  try {
    return f();
  } catch {
    return "?";
  }
}

// src/features/examples.ts
var ExampleToggle = class extends Feature {
  id = "example.toggle";
  name = "Example toggle";
  description = "Logs + shows a toast when switched";
  category = "Examples";
  onEnable(ctx) {
    ctx.notify.success("Example enabled", "put your code in onEnable()");
    log.info("ExampleToggle \u2192 on");
  }
  onDisable(ctx) {
    ctx.notify.info("Example disabled");
    log.info("ExampleToggle \u2192 off");
  }
};
var ExampleWithSettings = class extends Feature {
  id = "example.settings";
  name = "Example with settings";
  description = "Has a slider, a dropdown and a toggle";
  category = "Examples";
  hasSettings = true;
  drawSettings(ui, _ctx) {
    const amount = this.get("amount", 5);
    ui.slider("Amount", amount, 0, 10, { step: 0.5, onChange: (v) => this.set("amount", v) });
    const modes = ["Slow", "Normal", "Fast"];
    ui.dropdown("Mode", this.get("mode", 1), modes, (i) => this.set("mode", i));
    ui.toggle("Sub-option", this.get("sub", false), (v) => this.set("sub", v));
    ui.textDim(`amount=${amount}  mode=${modes[this.get("mode", 1)]}`);
  }
};
var ExampleTicker = class extends Feature {
  id = "example.ticker";
  name = "Example per-frame";
  description = "Counts time while enabled (onUpdate)";
  category = "Examples";
  hasSettings = true;
  persist = false;
  seconds = 0;
  onEnable() {
    this.seconds = 0;
  }
  onUpdate(dt) {
    this.seconds += dt;
  }
  drawSettings(ui) {
    ui.keyValue("Running for", `${this.seconds.toFixed(1)} s`, theme.accent2);
    ui.progress(this.seconds % 10 / 10, "10 s cycle");
    if (ui.button("Reset counter", { small: true }))
      this.seconds = 0;
  }
};
var MyFeature = class extends Feature {
  id = "my.feature";
  // unique, stable
  name = "My feature";
  // shown in the list
  description = "Describe what it does";
  category = "Your category";
  // groups the list
  onEnable(_ctx) {
  }
  onDisable(_ctx) {
  }
  onUpdate(_dt, _ctx) {
  }
};
featureRegistry.register(new ExampleToggle());
featureRegistry.register(new ExampleWithSettings());
featureRegistry.register(new ExampleTicker());
featureRegistry.register(new MyFeature());

// src/index.ts
installExportResolver();
var menu = null;
Il2Cpp.perform(() => {
  let unity = "?", app = "?";
  try {
    unity = Il2Cpp.unityVersion;
  } catch {
  }
  try {
    app = `${Il2Cpp.application.identifier} ${Il2Cpp.application.version}`;
  } catch {
  }
  log.info(`${MENU_INFO.name} v${MENU_INFO.version} \u2014 Unity ${unity} \xB7 ${app}`);
  menu = new Menu();
  menu.start();
  log.info("waiting for the first frame\u2026 (load fully into the game if nothing happens)");
}).catch((e) => log.error(`startup failed: ${describe(e)}`));
rpc.exports = {
  unload: () => {
    menu?.unload();
  },
  rebuild: () => {
    menu?.rebuild();
  },
  open: () => {
    menu?.setVisible(true);
  },
  close: () => {
    menu?.setVisible(false);
  }
};
