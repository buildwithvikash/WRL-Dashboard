import { useEffect } from "react";
import { useSelector } from "react-redux";
import axios from "axios";
import { baseURL } from "../assets/assets";

const PING_INTERVAL_MS = 60_000;

// Pings the backend once a minute while logged in. It keeps this session's
// "last seen" fresh (the "online" indicator in Settings > User Access), and a
// force-logout / deactivation comes back as a 401 here — which the global
// axios interceptor turns into a logout + toast — so an idle tab is signed out
// within a minute rather than only at the user's next click.
export const useSessionHeartbeat = () => {
  const user = useSelector((store) => store.auth.user);

  useEffect(() => {
    if (!user) return undefined;

    const ping = () => {
      axios.get(`${baseURL}auth/session`).catch(() => {});
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") ping();
    };

    const id = setInterval(ping, PING_INTERVAL_MS);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [user]);
};
