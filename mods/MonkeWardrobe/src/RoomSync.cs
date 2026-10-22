using System;
using System.Collections.Generic;
using Photon.Pun;
using Photon.Realtime;
using UnityEngine;
using Hashtable = ExitGames.Client.Photon.Hashtable;

namespace MonkeWardrobe
{
    /// <summary>
    /// Shares the local loadout with other MonkeWardrobe players through one Photon player property.
    /// It is only ever set in modded rooms (and private rooms if enabled), so public lobbies never see
    /// it. What arrives from others is just a list of ids: <see cref="Loadout.Decode"/> validates it and
    /// only ids that exist in your own Cosmetics folder are ever shown.
    /// </summary>
    internal sealed class RoomSync : MonoBehaviourPunCallbacks
    {
        public const string PropertyKey = "mw.loadout";
        const string GameModeKey = "gameMode";
        const float PublishDelay = 1f;

        readonly Dictionary<int, Loadout> remoteLoadouts = new Dictionary<int, Loadout>();
        int publishedStamp = int.MinValue;
        float publishAt = float.MaxValue;

        public bool SharingAllowed { get; private set; }

        static Plugin Mod => Plugin.Instance;

        public bool TryGetLoadout(int actorNumber, out Loadout loadout) => remoteLoadouts.TryGetValue(actorNumber, out loadout);

        public string Describe()
        {
            if (!PhotonNetwork.InRoom)
                return "Not in a room: previewing your cosmetics locally.";
            if (!SharingAllowed)
                return "Public room: your cosmetics are only visible to you.";

            int others = 0;
            foreach (Loadout loadout in remoteLoadouts.Values)
            {
                if (!loadout.IsEmpty)
                    others++;
            }
            return $"Modded room: sharing. {others} other MonkeWardrobe player(s) here.";
        }

        void OnDestroy() => ForgetLocalProperty();

        void Update()
        {
            if (!SharingAllowed || !PhotonNetwork.InRoom)
                return;

            int stamp = Mod.Loadout.Version * 2 + (Mod.Enabled.Value ? 1 : 0);
            if (stamp == publishedStamp)
            {
                publishAt = float.MaxValue;
                return;
            }

            // Cycling through cosmetics changes the loadout several times a second; send only the
            // state it settles on.
            float now = Time.unscaledTime;
            if (publishAt == float.MaxValue)
                publishAt = now + PublishDelay;
            if (now < publishAt)
                return;

            publishAt = float.MaxValue;
            publishedStamp = stamp;
            Publish(Mod.Enabled.Value && !Mod.Loadout.IsEmpty ? Mod.Loadout.Encode() : null);
        }

        public override void OnJoinedRoom()
        {
            Evaluate();
            if (SharingAllowed)
                publishAt = Time.unscaledTime;
        }

        public override void OnLeftRoom() => Reset();

        public override void OnDisconnected(DisconnectCause cause) => Reset();

        public override void OnPlayerEnteredRoom(Player newPlayer) => Read(newPlayer);

        public override void OnPlayerLeftRoom(Player otherPlayer) => remoteLoadouts.Remove(otherPlayer.ActorNumber);

        public override void OnPlayerPropertiesUpdate(Player targetPlayer, Hashtable changedProps)
        {
            if (changedProps != null && changedProps.ContainsKey(PropertyKey))
                Read(targetPlayer);
        }

        public override void OnRoomPropertiesUpdate(Hashtable propertiesThatChanged)
        {
            if (propertiesThatChanged != null && propertiesThatChanged.ContainsKey(GameModeKey))
                Evaluate();
        }

        void Evaluate()
        {
            Room room = PhotonNetwork.CurrentRoom;
            bool allowed = room != null && (IsModded(room) || (Mod.AllowPrivateRooms.Value && !room.IsVisible));
            SharingAllowed = allowed;
            remoteLoadouts.Clear();
            if (!allowed)
            {
                Withdraw();
                return;
            }

            publishedStamp = int.MinValue;
            foreach (Player player in PhotonNetwork.PlayerListOthers)
                Read(player);
        }

        static bool IsModded(Room room) =>
            room.CustomProperties != null
            && room.CustomProperties.TryGetValue(GameModeKey, out object mode)
            && mode is string text
            && text.IndexOf("MODDED", StringComparison.OrdinalIgnoreCase) >= 0;

        void Read(Player player)
        {
            if (!SharingAllowed || player == null || player.IsLocal)
                return;
            if (player.CustomProperties != null && player.CustomProperties.TryGetValue(PropertyKey, out object value) && value is string encoded)
                remoteLoadouts[player.ActorNumber] = Loadout.Decode(encoded);
            else
                remoteLoadouts.Remove(player.ActorNumber);
        }

        void Publish(string encoded)
        {
            Player me = PhotonNetwork.LocalPlayer;
            if (me == null)
                return;
            // Skip the network call when there is nothing to add and nothing to take back.
            if (encoded == null && (me.CustomProperties == null || !me.CustomProperties.ContainsKey(PropertyKey)))
                return;
            me.SetCustomProperties(new Hashtable { [PropertyKey] = encoded }); // null deletes the property
        }

        void Withdraw()
        {
            Player me = PhotonNetwork.LocalPlayer;
            if (me?.CustomProperties == null || !me.CustomProperties.ContainsKey(PropertyKey))
                return;
            if (PhotonNetwork.InRoom)
                me.SetCustomProperties(new Hashtable { [PropertyKey] = null });
            ForgetLocalProperty();
        }

        void Reset()
        {
            SharingAllowed = false;
            remoteLoadouts.Clear();
            publishedStamp = int.MinValue;
            publishAt = float.MaxValue;
            ForgetLocalProperty();
        }

        /// <summary>
        /// Photon sends the local player's properties along when joining the next room. Dropping ours on
        /// leave means a public room we join afterwards never receives it.
        /// </summary>
        static void ForgetLocalProperty()
        {
            try
            {
                PhotonNetwork.LocalPlayer?.CustomProperties?.Remove(PropertyKey);
            }
            catch (Exception error)
            {
                Plugin.Log.LogWarning("Could not clear the MonkeWardrobe player property: " + error.Message);
            }
        }
    }
}
