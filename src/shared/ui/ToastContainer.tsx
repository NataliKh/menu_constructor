import React, { useState, useCallback } from "react";
import { Toast } from "./Toast";
import type { ToastType } from "./Toast";
import styles from "./ToastContainer.module.css";

export interface ToastItem {
  id: number;
  message: string;
  type?: ToastType;
  duration?: number;
}

export interface ToastContainerProps {}

export const ToastContainerContext = React.createContext<{
  notify: (msg: string, type?: ToastType, duration?: number) => void;
} | null>(null);

export const ToastContainer: React.FC<
  React.PropsWithChildren<ToastContainerProps>
> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const notify = useCallback(
    (message: string, type: ToastType = "info", duration = 3000) => {
      setToasts((prev) => [
        ...prev,
        { id: Date.now() + Math.random(), message, type, duration },
      ]);
    },
    []
  );
  const remove = (id: number) =>
    setToasts((prev) => prev.filter((t) => t.id !== id));

  return (
    <ToastContainerContext.Provider value={{ notify }}>
      {children}
      <div className={styles.toastContainer}>
        {toasts.map((t) => (
          <div key={t.id} className={styles.toastItem}>
            <Toast {...t} onClose={() => remove(t.id)} />
          </div>
        ))}
      </div>
    </ToastContainerContext.Provider>
  );
};
