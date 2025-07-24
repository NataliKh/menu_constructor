import React from "react";
import type { MenuItem } from "../../entities/menu";
import styles from "./MenuPreview.module.css";

interface MenuPreviewProps {
  items: MenuItem[];
  menuClassName?: string;
}

const renderMenu = (items: MenuItem[], level = 0) => (
  <ul className={styles.menu}>
    {items.map((item) => (
      <li key={item.id} className={item.className}>
        {item.image && (
          <img src={item.image} alt="img" className={styles.image} />
        )}
        {item.icon && <span className={styles.icon}>[icon: {item.icon}]</span>}
        {item.SVG && <span className={styles.icon}>[SVG: {item.SVG}]</span>}
        {item.uri ? (
          <a
            href={item.uri}
            className={styles.link}
            onMouseOver={(e) => {
              e.currentTarget.classList.add(styles.hovered);
            }}
            onMouseOut={(e) => {
              e.currentTarget.classList.remove(styles.hovered);
            }}
          >
            {item.text}
          </a>
        ) : (
          <span className={styles.text}>{item.text}</span>
        )}
        {item.children &&
          item.children.length > 0 &&
          renderMenu(item.children, level + 1)}
      </li>
    ))}
  </ul>
);

export const MenuPreview: React.FC<MenuPreviewProps> = ({
  items,
  menuClassName,
}) => {
  return (
    <div className={styles.container}>
      <h2 className={styles.title}>Предпросмотр меню</h2>
      <div className={menuClassName}>{renderMenu(items)}</div>
    </div>
  );
};
