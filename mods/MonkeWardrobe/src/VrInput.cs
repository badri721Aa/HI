using System.Collections;
using UnityEngine;
using UnityEngine.XR;

namespace MonkeWardrobe
{
    /// <summary>
    /// Headset controls, no menu needed: hold the left stick down, then X equips the next cosmetic in
    /// the selected slot and Y selects the next slot (the controller buzzes once per slot number:
    /// 1 = Head ... 5 = RightHand). Uses Unity's XR API, so it does not depend on the game's input code.
    /// </summary>
    internal sealed class VrInput : MonoBehaviour
    {
        CosmeticSlot slot = CosmeticSlot.Head;
        bool wasPrimary;
        bool wasSecondary;

        static Plugin Mod => Plugin.Instance;

        void Update()
        {
            if (!Mod.VrControls.Value)
                return;
            InputDevice left = InputDevices.GetDeviceAtXRNode(XRNode.LeftHand);
            if (!left.isValid)
                return;

            left.TryGetFeatureValue(CommonUsages.primary2DAxisClick, out bool stickHeld);
            left.TryGetFeatureValue(CommonUsages.primaryButton, out bool primary);
            left.TryGetFeatureValue(CommonUsages.secondaryButton, out bool secondary);
            bool primaryPressed = primary && !wasPrimary;
            bool secondaryPressed = secondary && !wasSecondary;
            wasPrimary = primary;
            wasSecondary = secondary;

            if (!stickHeld)
                return;
            if (secondaryPressed)
            {
                slot = (CosmeticSlot)(((int)slot + 1) % Slots.All.Length);
                StartCoroutine(Buzz(left, (int)slot + 1));
                Plugin.Log.LogInfo($"VR controls: {slot} slot selected.");
            }
            if (primaryPressed)
            {
                Mod.Cycle(slot, +1);
                StartCoroutine(Buzz(left, 1));
            }
        }

        static IEnumerator Buzz(InputDevice device, int pulses)
        {
            for (int i = 0; i < pulses; i++)
            {
                device.SendHapticImpulse(0u, 0.4f, 0.05f);
                yield return new WaitForSecondsRealtime(0.15f);
            }
        }
    }
}
