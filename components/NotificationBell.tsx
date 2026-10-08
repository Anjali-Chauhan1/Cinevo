"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { Icon } from "@/components/Icon";
import { api } from "@/lib/client-api";
import { relativeTime } from "@/lib/format";

interface NotificationItem {
  id: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

const POLL_MS = 30_000;

/** Bell with unread count. Opening the panel marks everything read. */
export function NotificationBell() {
  const { user } = useAuth();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  const load = useCallback(async () => {
    try {
      const d = await api.get<{ notifications: NotificationItem[]; unreadCount: number }>("/api/notifications");
      setItems(d.notifications);
      setUnread(d.unreadCount);
    } catch {
      // Signed out or offline — the bell just stays as it was.
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [user, load]);

  useEffect(() => {
    if (!open) return;
    function dismiss(e: PointerEvent) {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    }
    function escape(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      }
    }
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  if (!user) return null;

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && unread > 0) {
      setUnread(0);
      await api.post("/api/notifications/read").catch(() => {});
    }
  }

  return (
    <div className="notification-wrap" ref={wrap}>
      <button
        ref={trigger}
        type="button"
        className="notification-bell"
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
        aria-expanded={open}
        aria-controls="notification-panel"
        onClick={toggle}
      >
        <Icon name="bell" size={19} />
        {unread > 0 && <span className="notification-count">{unread > 9 ? "9+" : unread}</span>}
      </button>
      {open && (
        <div id="notification-panel" className="notification-panel" role="region" aria-label="Notifications">
          <p className="notification-heading">Notifications</p>
          {items.length === 0 ? (
            <p className="notification-empty">Nothing yet. Approvals, payouts and premiere reminders show up here.</p>
          ) : (
            <ul>
              {items.map((n) => {
                const content = (
                  <>
                    {!n.readAt && <span className="notification-dot" aria-label="Unread" />}
                    <span className="notification-text">
                      <strong>{n.title}</strong>
                      {n.body && <span>{n.body}</span>}
                      <small>{relativeTime(n.createdAt)}</small>
                    </span>
                  </>
                );
                return (
                  <li key={n.id}>
                    {n.link ? (
                      <Link href={n.link} onClick={() => setOpen(false)}>{content}</Link>
                    ) : (
                      <div>{content}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
