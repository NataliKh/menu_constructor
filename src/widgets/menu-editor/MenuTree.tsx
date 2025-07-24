import React, { useRef } from "react";
import type { MenuItem } from "../../entities/menu";
import styles from "./MenuEditor.module.css";
import { useDrag, useDrop } from "react-dnd";

interface MenuTreeProps {
  items: MenuItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAdd: (parentId: string) => void;
  onDelete: (id: string) => void;
  onMove?: (dragId: string, hoverId: string) => void;
  level?: number;
  openMap: Record<string, boolean>;
  onToggle: (id: string) => void;
  selectedIds?: string[];
  setSelectedIds?: (ids: string[]) => void;
  onToggleVisible?: (id: string) => void;
}

const ITEM_TYPE = "MENU_ITEM";

// Проверка валидности URI
function validateUri(uri?: string): string | null {
  if (!uri || typeof uri !== "string" || uri.trim() === "") {
    return "URI не заполнен";
  }
  if (/\s/.test(uri)) {
    return "URI не должен содержать пробелов";
  }
  if (/\\/.test(uri)) {
    return "URI не должен содержать обратных слэшей (\\)";
  }
  if (/\/\//.test(uri)) {
    return "URI не должен содержать двойных слэшей (//)";
  }
  if (!/^[a-zA-Zа-яА-Я0-9_\-./]+$/.test(uri)) {
    return "Допустимы только буквы, цифры, -, _, ., /";
  }
  // относительные пути разрешены, но не должны начинаться/заканчиваться пробелом
  if (/^\s|\s$/.test(uri)) {
    return "URI не должен начинаться или заканчиваться пробелом";
  }
  return null;
}

export const MenuTree: React.FC<MenuTreeProps> = ({
  items,
  selectedId,
  onSelect,
  onAdd,
  onDelete,
  onMove,
  level = 0,
  openMap,
  onToggle,
  selectedIds = [],
  setSelectedIds,
  onToggleVisible,
}) => {
  return (
    <ul className={styles.treeList}>
      {items.map((item) => (
        <MenuTreeItem
          key={item.id}
          item={item}
          selectedId={selectedId}
          onSelect={onSelect}
          onAdd={onAdd}
          onDelete={onDelete}
          onMove={onMove}
          open={!!openMap[item.id]}
          onToggle={onToggle}
          level={level}
          openMap={openMap}
          selectedIds={selectedIds}
          setSelectedIds={setSelectedIds}
          onToggleVisible={onToggleVisible}
        />
      ))}
    </ul>
  );
};

interface MenuTreeItemProps {
  item: MenuItem;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAdd: (parentId: string) => void;
  onDelete: (id: string) => void;
  onMove?: (dragId: string, hoverId: string) => void;
  open: boolean;
  onToggle: (id: string) => void;
  level: number;
  openMap: Record<string, boolean>;
  selectedIds?: string[];
  setSelectedIds?: (ids: string[]) => void;
  onToggleVisible?: (id: string) => void;
}

const MenuTreeItem: React.FC<MenuTreeItemProps> = ({
  item,
  selectedId,
  onSelect,
  onAdd,
  onDelete,
  onMove,
  open,
  onToggle,
  level,
  openMap,
  selectedIds = [],
  setSelectedIds,
  onToggleVisible,
}) => {
  const ref = useRef<HTMLLIElement>(null);

  // Drag & Drop
  const [{ isDragging }, drag] = useDrag({
    type: ITEM_TYPE,
    item: { id: item.id },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  });

  const [, drop] = useDrop({
    accept: ITEM_TYPE,
    hover: (dragged: { id: string }) => {
      if (dragged.id !== item.id && onMove) {
        onMove(dragged.id, item.id);
      }
    },
  });

  drag(drop(ref));

  // --- Множественный выбор ---
  const isMultiSelected = selectedIds.includes(item.id);
  const handleCheckbox = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!setSelectedIds) return;
    if (e.target.checked) {
      setSelectedIds([...selectedIds, item.id]);
    } else {
      setSelectedIds(selectedIds.filter((id) => id !== item.id));
    }
  };
  const handleRowClick = (e: React.MouseEvent) => {
    // Только выделение для редактирования, не меняет множественный выбор
    onSelect(item.id);
  };

  const isInvisible = item.visible === false;
  return (
    <li
      ref={ref}
      className={
        styles.treeItem +
        (item.id === selectedId ? " " + styles.treeItemSelected : "") +
        (isDragging ? " " + styles.treeItemDragging : "") +
        (isMultiSelected ? " " + styles.treeItemSelectedMulti : "") +
        (isInvisible ? " " + styles.treeItemInvisible : "")
      }
    >
      <div className={styles.treeItemRow}>
        <input
          type="checkbox"
          className={styles.treeCheckbox}
          checked={isMultiSelected}
          onChange={handleCheckbox}
          onClick={(e) => e.stopPropagation()}
        />
        {item.children && item.children.length > 0 ? (
          <span className={styles.treeArrow} onClick={() => onToggle(item.id)}>
            {open ? "▾" : "▸"}
          </span>
        ) : (
          <span className={styles.treeArrowPlaceholder} />
        )}
        {/* Валидация URI и подсветка ошибок */}
        {(() => {
          const error = validateUri(item.uri);
          const [showTooltip, setShowTooltip] = React.useState(false);
          return (
            <span
              className={
                styles.treeItemLabel + (error ? " " + styles.treeItemError : "")
              }
              onClick={handleRowClick}
              style={{
                position: "relative",
                display: "inline-flex",
                alignItems: "center",
                cursor: "pointer",
              }}
            >
              {item.text || <em>(Без названия)</em>}
              {error && (
                <span
                  className={styles.treeItemErrorIcon}
                  onMouseEnter={() => setShowTooltip(true)}
                  onMouseLeave={() => setShowTooltip(false)}
                  tabIndex={0}
                  aria-label={error}
                  style={{ marginLeft: 4 }}
                >
                  &#9888;
                  {showTooltip && (
                    <span className={styles.treeItemErrorTooltip}>{error}</span>
                  )}
                </span>
              )}
            </span>
          );
        })()}
        <button
          className={styles.treeBtn}
          title="Добавить подменю"
          onClick={() => onAdd(item.id)}
        >
          +
        </button>
        <button
          className={styles.treeBtn}
          title="Удалить пункт"
          onClick={() => onDelete(item.id)}
        >
          –
        </button>
        <button
          className={
            styles.treeEyeBtn +
            (isInvisible ? " " + styles.treeEyeBtnHidden : "")
          }
          title={isInvisible ? "Сделать видимым" : "Скрыть"}
          onClick={() => onToggleVisible && onToggleVisible(item.id)}
          tabIndex={-1}
        >
          {isInvisible ? "🚫" : "👁️"}
        </button>
      </div>
      {item.children && item.children.length > 0 && (
        <div
          className={
            styles.treeChildrenWrap + (open ? " " + styles.treeOpen : "")
          }
        >
          {open && (
            <MenuTree
              items={item.children}
              selectedId={selectedId}
              selectedIds={selectedIds}
              setSelectedIds={setSelectedIds}
              onSelect={onSelect}
              onAdd={onAdd}
              onDelete={onDelete}
              onMove={onMove}
              level={level + 1}
              openMap={openMap}
              onToggle={onToggle}
              onToggleVisible={onToggleVisible}
            />
          )}
        </div>
      )}
    </li>
  );
};
