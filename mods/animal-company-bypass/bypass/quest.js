const QUEST_PLATFORM = 1;

function loadQuestServers() {
  console.log("\n");
  console.log("[+] Quest-platform Photon version spoof");

  try {
      const symbols = Il2Cpp.$config.exports;

  Il2Cpp.perform(() => {
    const findClass = (n) => {
      for (const a of Il2Cpp.domain.assemblies) {
        try {
          const k = a.image.tryClass(n);
          if (k) return k;
        } catch (_) {}
      }
      return null;
    };

    const AppUtils = findClass("AnimalCompany.AppUtils");
    if (!AppUtils) {
      console.log("[-] AppUtils not found");
      return;
    }

    let method = null;
    for (const m of AppUtils.methods) {
      if (
        /CalculatePhotonAppVersion/i.test(m.name) &&
        (m.returnType && m.returnType.name) === "System.String"
      ) {
        method = m;
        break;
      }
    }

    if (!method) {
      console.log("[-] CalculatePhotonAppVersion not found");
      return;
    }

    Interceptor.attach(method.virtualAddress, {
      onEnter(args) {
        try {
          args[2] = ptr(QUEST_PLATFORM);
        } catch (_) {}
      },
    });
  });
  } catch (e) {
    console.log("[-] Error: " + e);
  }
}

loadQuestServers();
