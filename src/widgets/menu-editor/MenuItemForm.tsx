import React from "react";
import type { MenuItem } from "../../entities/menu";
import styles from "./MenuEditor.module.css";

interface MenuItemFormProps {
  item: MenuItem;
  onChange: (id: string, fields: Partial<MenuItem>) => void;
}

export const MenuItemForm: React.FC<MenuItemFormProps> = ({
  item,
  onChange,
}) => {
  return (
    <form className={styles.menuItemForm} onSubmit={(e) => e.preventDefault()}>
      <label className={styles.formLabel}>
        Текст:
        <input
          type="text"
          value={item.text}
          onChange={(e) => onChange(item.id, { text: e.target.value })}
          className={styles.input}
        />
      </label>
      <label className={styles.formLabel}>
        URI:
        <input
          type="text"
          value={item.uri || ""}
          onChange={(e) => onChange(item.id, { uri: e.target.value })}
          className={styles.input}
        />
      </label>
      <label className={styles.formLabel}>
        Класс:
        <input
          type="text"
          value={item.className || ""}
          onChange={(e) => onChange(item.id, { className: e.target.value })}
          className={styles.input}
        />
      </label>
      <label className={styles.formLabel}>
        Иконка:
        <input
          type="text"
          value={item.icon || ""}
          onChange={(e) => onChange(item.id, { icon: e.target.value })}
          className={styles.input}
        />
      </label>
      <label className={styles.formLabel}>
        SVG:
        <input
          type="text"
          value={item.SVG || ""}
          onChange={(e) => onChange(item.id, { SVG: e.target.value })}
          className={styles.input}
        />
      </label>
      <label className={styles.formLabel}>
        Изображение:
        <input
          type="file"
          accept="image/*"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              const reader = new FileReader();
              reader.onload = (ev) => {
                onChange(item.id, { image: ev.target?.result as string });
              };
              reader.readAsDataURL(file);
            }
          }}
          className={styles.input}
        />
        {item.image && (
          <img src={item.image} alt="img" className={styles.imagePreview} />
        )}
      </label>
    </form>
  );
};
