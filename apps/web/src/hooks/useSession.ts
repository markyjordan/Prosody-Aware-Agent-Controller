import { useEffect } from "react";
import { session, wsUrl } from "../session/session";
import { useSessionStore } from "../state/store";

export function useSession() {
  useEffect(() => {
    session.connect(wsUrl());
    return () => session.disconnect();
  }, []);
  return {
    conn: useSessionStore((s) => s.conn),
    statusLine: useSessionStore((s) => s.statusLine),
  };
}
