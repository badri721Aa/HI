// C# — world-to-screen ESP rendered with OnGUI (no extra render pipeline needed).
using UnityEngine;

namespace AnimalCompanyMenu
{
    public static class ESP
    {
        public static bool EnemyESP;
        public static bool ItemESP;
        public static bool PlayerESP;
        public static float MaxDistance = 150f;

        private static Texture2D _dotTex;
        private static Texture2D DotTex
        {
            get
            {
                if (_dotTex == null)
                {
                    _dotTex = new Texture2D(1, 1);
                    _dotTex.SetPixel(0, 0, Color.white);
                    _dotTex.Apply();
                }
                return _dotTex;
            }
        }

        public static void Draw()
        {
            Camera cam = Camera.main;
            if (cam == null || Patches.LocalPlayerTransform == null) return;

            if (EnemyESP)
                foreach (Component enemy in Patches.AllEnemies)
                    DrawMarker(cam, enemy, Color.red);

            if (ItemESP)
                foreach (Component item in Patches.AllItems)
                    DrawMarker(cam, item, Color.yellow);

            if (PlayerESP)
                foreach (Component player in Patches.AllPlayers)
                {
                    if (player == null || player.transform == Patches.LocalPlayerTransform) continue;
                    DrawMarker(cam, player, Color.cyan);
                }
        }

        private static void DrawMarker(Camera cam, Component target, Color color)
        {
            if (target == null) return;

            Vector3 worldPos = target.transform.position;
            float dist = Vector3.Distance(Patches.LocalPlayerTransform.position, worldPos);
            if (dist > MaxDistance) return;

            Vector3 screen = cam.WorldToScreenPoint(worldPos + Vector3.up * 1f);
            if (screen.z <= 0f) return; // behind the camera

            float x = screen.x;
            float y = Screen.height - screen.y;

            Color prev = GUI.color;
            GUI.color = color;

            const float size = 6f;
            GUI.DrawTexture(new Rect(x - size / 2f, y - size / 2f, size, size), DotTex);
            GUI.Label(new Rect(x + 6f, y - 8f, 220f, 20f), $"{target.gameObject.name} [{dist:0}m]");
            DrawLine(new Vector2(Screen.width / 2f, Screen.height), new Vector2(x, y), color, 1.5f);

            GUI.color = prev;
        }

        // Standard Unity IMGUI line-drawing trick: stretch and rotate a 1x1 texture.
        public static void DrawLine(Vector2 pointA, Vector2 pointB, Color color, float width)
        {
            Matrix4x4 prevMatrix = GUI.matrix;
            Color prevColor = GUI.color;
            GUI.color = color;

            Vector2 delta = pointB - pointA;
            float length = delta.magnitude;
            float angle = Mathf.Atan2(delta.y, delta.x) * Mathf.Rad2Deg;

            GUIUtility.RotateAroundPivot(angle, pointA);
            GUI.DrawTexture(new Rect(pointA.x, pointA.y - width / 2f, length, width), DotTex);

            GUI.matrix = prevMatrix;
            GUI.color = prevColor;
        }
    }
}
