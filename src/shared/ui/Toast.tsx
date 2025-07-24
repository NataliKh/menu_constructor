import React, { useEffect } from "react";
import styles from "./Toast.module.css";

export type ToastType = "success" | "error" | "info";

export interface ToastProps {
  message: string;
  type?: ToastType;
  onClose: () => void;
  duration?: number;
}

export const Toast: React.FC<ToastProps> = ({
  message,
  type = "info",
  onClose,
  duration = 3000,
}) => {
  useEffect(() => {
    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [onClose, duration]);

  let bg = "#232946",
    color = "#fff";
  if (type === "success") {
    bg = "#4caf50";
    color = "#fff";
  }
  if (type === "error") {
    bg = "#ffcdd2";
    color = "#b71c1c";
  }
  if (type === "info") {
    bg = "#eebbc3";
    color = "#232946";
  }

  return (
    <div
      className={styles.toast}
      style={{
        minWidth: 220,
        maxWidth: 340,
        marginBottom: 16,
        background: bg,
        color,
        borderRadius: 12,
        boxShadow: "0 4px 24px #0002, 0 1.5px 4px #0001",
        padding: "14px 24px",
        fontWeight: 500,
        fontSize: 16,
        display: "flex",
        alignItems: "center",
        gap: 12,
        zIndex: 9999,
        cursor: "pointer",
        transition: "opacity 0.2s",
      }}
      onClick={onClose}
      role="alert"
    >
      {type === "success" && <span style={{ fontSize: 20 }}>✅</span>}
      {type === "error" && <span style={{ fontSize: 20 }}>⛔</span>}
      {type === "info" && <span style={{ fontSize: 20 }}>ℹ️</span>}
      <span style={{ flex: 1 }}>{message}</span>
      <span style={{ fontSize: 20, marginLeft: 8, opacity: 0.5 }}>&times;</span>
    </div>
  );
};
