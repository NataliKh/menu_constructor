import React, { useState, useEffect } from "react";
import type { MenuItem } from "../../entities/menu";
import { v4 as uuidv4 } from "uuid";
import styles from "./MenuEditor.module.css";

import { MenuTree } from "./MenuTree";
import { MenuItemForm } from "./MenuItemForm";

interface MenuEditorProps {
  value: MenuItem[];
  onChange: (items: MenuItem[]) => void;
}

export const MenuEditor: React.FC<MenuEditorProps> = ({ value, onChange }) => {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [openMap, setOpenMap] = useState<Record<string, boolean>>({});

  // --- Множественный выбор ---
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkClass, setBulkClass] = useState("");
  const [bulkIcon, setBulkIcon] = useState("");
  const [bulkVisible, setBulkVisible] = useState(true);

  // --- Фильтрация и поиск ---
  const [search, setSearch] = useState("");
  const [onlyWithChildren, setOnlyWithChildren] = useState(false);
  const [onlyWithoutChildren, setOnlyWithoutChildren] = useState(false);
  const [onlyWithIcon, setOnlyWithIcon] = useState(false);
  const [onlyWithoutIcon, setOnlyWithoutIcon] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  // Сброс раскрытия веток при смене меню
  // useEffect(() => {
  //   setOpenMap({});
  //   setSelectedIds([]);
  // }, [value]);

  const handleToggle = (id: string) => {
    setOpenMap((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // --- Bulk операции ---
  const handleBulkDelete = () => {
    const deleteFromTree = (items: MenuItem[]): MenuItem[] =>
      items
        .filter((item) => !selectedIds.includes(item.id))
        .map((item) => ({
          ...item,
          children: item.children ? deleteFromTree(item.children) : [],
        }));
    onChange(deleteFromTree(value));
    setSelectedIds([]);
  };
  const handleBulkEdit = () => {
    const editTree = (items: MenuItem[]): MenuItem[] =>
      items.map((item) =>
        selectedIds.includes(item.id)
          ? {
              ...item,
              className: bulkClass !== "" ? bulkClass : item.className,
              icon: bulkIcon !== "" ? bulkIcon : item.icon,
              visible: bulkVisible,
            }
          : {
              ...item,
              children: item.children ? editTree(item.children) : [],
            }
      );
    onChange(editTree(value));
    setBulkClass("");
    setBulkIcon("");
  };
  const handleBulkClear = () => setSelectedIds([]);

  // --- Фильтрация дерева ---
  function filterTree(items: MenuItem[]): MenuItem[] {
    return items
      .map((item) => {
        const children = item.children ? filterTree(item.children) : [];
        let matches = true;
        if (search.trim()) {
          const s = search.trim().toLowerCase();
          matches =
            (item.text && item.text.toLowerCase().includes(s)) ||
            (item.uri && item.uri.toLowerCase().includes(s)) ||
            (item.className && item.className.toLowerCase().includes(s));
        }
        if (onlyWithChildren && (!item.children || item.children.length === 0))
          matches = false;
        if (onlyWithoutChildren && item.children && item.children.length > 0)
          matches = false;
        if (onlyWithIcon && !item.icon) matches = false;
        if (onlyWithoutIcon && item.icon) matches = false;
        if (!matches && children.length === 0) return null;
        return {
          ...item,
          children,
        };
      })
      .filter(Boolean) as MenuItem[];
  }

  // Добавить пункт
  const handleAdd = (parentId?: string) => {
    const newItem: MenuItem = {
      id: uuidv4(),
      text: "Новый пункт",
      uri: "",
      children: [],
    };
    if (!parentId) {
      onChange([...value, newItem]);
      setOpenMap((prev) => ({ ...prev, [newItem.id]: true }));
      setSelectedId(newItem.id);
    } else {
      const addToTree = (items: MenuItem[]): MenuItem[] =>
        items.map((item) =>
          item.id === parentId
            ? { ...item, children: [...(item.children || []), newItem] }
            : {
                ...item,
                children: item.children ? addToTree(item.children) : [],
              }
        );
      onChange(addToTree(value));
      setOpenMap((prev) => ({ ...prev, [parentId]: true }));
      setSelectedId(newItem.id);
    }
  };

  // Удалить пункт
  const handleDelete = (id: string) => {
    const deleteFromTree = (items: MenuItem[]): MenuItem[] =>
      items
        .filter((item) => item.id !== id)
        .map((item) => ({
          ...item,
          children: item.children ? deleteFromTree(item.children) : [],
        }));
    onChange(deleteFromTree(value));
    if (selectedId === id) setSelectedId(null);
  };

  // Редактировать пункт
  const handleEdit = (id: string, fields: Partial<MenuItem>) => {
    const editTree = (items: MenuItem[]): MenuItem[] =>
      items.map((item) =>
        item.id === id
          ? { ...item, ...fields }
          : { ...item, children: item.children ? editTree(item.children) : [] }
      );
    onChange(editTree(value));
  };

  // Найти выбранный пункт
  const findItem = (items: MenuItem[], id: string | null): MenuItem | null => {
    for (const item of items) {
      if (item.id === id) return item;
      if (item.children) {
        const found = findItem(item.children, id);
        if (found) return found;
      }
    }
    return null;
  };

  // Перемещение пункта (drag&drop)
  const handleMove = (dragId: string, hoverId: string) => {
    if (dragId === hoverId) return;
    // Рекурсивно ищем и удаляем dragItem, а затем вставляем его перед hoverItem
    let dragItem: MenuItem | null = null;
    function removeItem(items: MenuItem[]): MenuItem[] {
      return items.filter((item) => {
        if (item.id === dragId) {
          dragItem = item;
          return false;
        }
        if (item.children) {
          item.children = removeItem(item.children);
        }
        return true;
      });
    }
    function insertBefore(items: MenuItem[]): MenuItem[] {
      let res: MenuItem[] = [];
      for (let item of items) {
        if (item.id === hoverId && dragItem) {
          res.push(dragItem);
        }
        res.push(item);
        if (item.children) {
          item.children = insertBefore(item.children);
        }
      }
      return res;
    }
    let newTree = removeItem([...value]);
    newTree = insertBefore(newTree);
    onChange(newTree);
  };

  const selectedItem = findItem(value, selectedId);

  // --- Применяем фильтрацию ---
  const filteredValue = filterTree(value);

  // SVG-иконки для bulkPanel
  const IconEdit = () => (
    <span className={styles.bulkPanelIcon} title="Изменить">
      ✏️
    </span>
  );
  const IconDelete = () => (
    <span className={styles.bulkPanelIcon} title="Удалить">
      🗑️
    </span>
  );
  const IconClear = () => (
    <span className={styles.bulkPanelIcon} title="Снять выделение">
      ❌
    </span>
  );

  // --- Дублирование одного пункта ---
  const handleDuplicate = () => {
    if (selectedIds.length !== 1) return;
    const id = selectedIds[0];
    function duplicateInTree(items: MenuItem[]): MenuItem[] {
      let res: MenuItem[] = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        res.push(item);
        if (item.id === id) {
          const clone = deepCloneWithNewIds(item);
          res.push(clone);
        }
        if (item.children) {
          item.children = duplicateInTree(item.children);
        }
      }
      return res;
    }
    onChange(duplicateInTree(value));
    setSelectedIds([]);
  };

  // --- Переключение видимости пункта ---
  const handleToggleVisible = (id: string) => {
    const toggleTree = (items: MenuItem[]): MenuItem[] =>
      items.map((item) =>
        item.id === id
          ? { ...item, visible: item.visible === false ? true : false }
          : {
              ...item,
              children: item.children ? toggleTree(item.children) : [],
            }
      );
    onChange(toggleTree(value));
  };

  // --- Фильтрация невидимых при экспорте ---
  function filterInvisible(items: MenuItem[]): MenuItem[] {
    return items
      .filter((item) => item.visible !== false)
      .map((item) => ({
        ...item,
        children: item.children ? filterInvisible(item.children) : [],
      }));
  }

  // Глубокое копирование пункта меню с новыми id
  function deepCloneWithNewIds(item: MenuItem): MenuItem {
    return {
      ...item,
      id: uuidv4(),
      children: item.children ? item.children.map(deepCloneWithNewIds) : [],
    };
  }

  const handleExpandAll = () => {
    // Рекурсивно собрать все id пунктов меню
    function collectIds(items: MenuItem[]): string[] {
      return items.reduce<string[]>((acc, item) => {
        acc.push(item.id);
        if (item.children) acc.push(...collectIds(item.children));
        return acc;
      }, []);
    }
    const allIds = collectIds(value);
    const map: Record<string, boolean> = {};
    allIds.forEach((id) => (map[id] = true));
    setOpenMap(map);
  };

  const handleCollapseAll = () => {
    setOpenMap({});
  };

  // Определяем, все ли ветки раскрыты
  const allIds = (() => {
    function collectIds(items: MenuItem[]): string[] {
      return items.reduce<string[]>((acc, item) => {
        acc.push(item.id);
        if (item.children) acc.push(...collectIds(item.children));
        return acc;
      }, []);
    }
    return collectIds(value);
  })();
  const allOpen = allIds.length > 0 && allIds.every((id) => openMap[id]);

  const handleToggleAll = () => {
    if (allOpen) {
      setOpenMap({});
    } else {
      const map: Record<string, boolean> = {};
      allIds.forEach((id) => (map[id] = true));
      setOpenMap(map);
    }
  };

  return (
    <div className={styles.editorRow}>
      <div className={styles.tree}>
        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            marginBottom: 8,
          }}
        >
          <button onClick={() => handleAdd()} className={styles.addButton}>
            Добавить корневой пункт
          </button>
          {selectedIds.length > 0 && (
            <button
              className={styles.bulkPanelIconBtn}
              onClick={handleBulkClear}
              title="Снять выделение"
              style={{ marginLeft: 0 }}
            >
              <span className={styles.bulkPanelIcon}>❌</span>
            </button>
          )}
        </div>
        <div className={styles.filterPanel}>
          <div className={styles.filterRow}>
            <input
              className={styles.filterInput}
              type="text"
              placeholder="Поиск по названию, URI, классу..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button
              className={styles.filterResetBtn}
              onClick={() => {
                setSearch("");
                setOnlyWithChildren(false);
                setOnlyWithoutChildren(false);
                setOnlyWithIcon(false);
                setOnlyWithoutIcon(false);
              }}
              title="Сбросить фильтр"
            >
              Сбросить
            </button>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, margin: '8px 0' }}>
            <button
              type="button"
              className={styles.expandAllLink}
              onClick={handleToggleAll}
            >
              {allOpen ? 'Скрыть все' : 'Раскрыть все'}
            </button>
            <button
              className={styles.filterToggle}
              type="button"
              onClick={() => setShowFilters((v) => !v)}
            >
              {showFilters ? "Скрыть доп. фильтры" : "Доп. фильтры"}
            </button>
          </div>
          {showFilters && (
            <div className={styles.filterCheckboxes}>
              <label>
                <input
                  type="checkbox"
                  className={styles.filterCheckbox}
                  checked={onlyWithChildren}
                  onChange={(e) => setOnlyWithChildren(e.target.checked)}
                  disabled={onlyWithoutChildren}
                />
                Только с детьми
              </label>
              <label>
                <input
                  type="checkbox"
                  className={styles.filterCheckbox}
                  checked={onlyWithoutChildren}
                  onChange={(e) => setOnlyWithoutChildren(e.target.checked)}
                  disabled={onlyWithChildren}
                />
                Только без детей
              </label>
              <label>
                <input
                  type="checkbox"
                  className={styles.filterCheckbox}
                  checked={onlyWithIcon}
                  onChange={(e) => setOnlyWithIcon(e.target.checked)}
                  disabled={onlyWithoutIcon}
                />
                Только с иконкой
              </label>
              <label>
                <input
                  type="checkbox"
                  className={styles.filterCheckbox}
                  checked={onlyWithoutIcon}
                  onChange={(e) => setOnlyWithoutIcon(e.target.checked)}
                  disabled={onlyWithIcon}
                />
                Только без иконки
              </label>
            </div>
          )}
        </div>
        <MenuTree
          items={filteredValue}
          selectedId={selectedId}
          selectedIds={selectedIds}
          setSelectedIds={setSelectedIds}
          onSelect={setSelectedId}
          onAdd={handleAdd}
          onDelete={handleDelete}
          onMove={handleMove}
          openMap={openMap}
          onToggle={handleToggle}
          onToggleVisible={handleToggleVisible}
        />
      </div>
      <div className={styles.form}>
        {selectedIds.length > 1 ? (
          <div className={styles.bulkPanel}>
            <span>Выбрано: {selectedIds.length}</span>
            <input
              className={styles.bulkPanelInput}
              placeholder="className"
              value={bulkClass}
              onChange={(e) => setBulkClass(e.target.value)}
            />
            <input
              className={styles.bulkPanelInput}
              placeholder="icon"
              value={bulkIcon}
              onChange={(e) => setBulkIcon(e.target.value)}
            />
            <button
              className={styles.bulkPanelIconBtn}
              onClick={handleBulkEdit}
              title="Изменить"
            >
              <IconEdit />
            </button>
            <button
              className={styles.bulkPanelIconBtn}
              onClick={handleBulkDelete}
              title="Удалить"
            >
              <IconDelete />
            </button>
          </div>
        ) : selectedIds.length === 1 ? (
          <div className={styles.bulkPanel}>
            <span>Выбрано: 1</span>
            <button
              className={styles.bulkPanelIconBtn}
              onClick={handleDuplicate}
              title="Дублировать"
            >
              <span className={styles.bulkPanelIcon}>📑</span>
            </button>
          </div>
        ) : selectedItem ? (
          <MenuItemForm item={selectedItem} onChange={handleEdit} />
        ) : (
          <div className={styles.selectPlaceholder}>
            Выберите пункт для редактирования
          </div>
        )}
      </div>
    </div>
  );
};
