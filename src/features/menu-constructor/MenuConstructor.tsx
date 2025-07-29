import React, { useState, useEffect, useMemo, useRef } from "react";
import { MenuEditor } from "../../widgets/menu-editor/MenuEditor";
import { MenuPreview } from "../../widgets/menu-preview/MenuPreview";
import type { MenuItem } from "../../entities/menu";
import { GoogleSheetsImport } from "../google-sheets-import/GoogleSheetsImport";
import { ToastContainerContext } from "../../shared/ui/ToastContainer";
import styles from "./MenuConstructor.module.css";
import ReactDOMServer from "react-dom/server";

const LOCAL_STORAGE_KEY = "menu-constructor-current";
const MENU_LIST_KEY = "menu-constructor-list";
const TEMPLATES_KEY = "menu-constructor-php-templates";

interface SavedMenu {
  id: string;
  name: string;
  items: MenuItem[];
}

// Удаляет пустые children у листьев
function removeEmptyChildren(items: any[]): any[] {
  return items.map((item) => {
    const newItem = { ...item };
    if (newItem.children) {
      newItem.children = removeEmptyChildren(newItem.children);
      if (newItem.children.length === 0) {
        delete newItem.children;
      }
    }
    return newItem;
  });
}

// --- Экспорт JSON ---
function exportJSON(menu: MenuItem[], name: string) {
  const cleanedMenu = removeEmptyChildren(menu);
  const data = JSON.stringify(cleanedMenu, null, 2);
  const blob = new Blob([data], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name || "menu"}.json`;
  a.click();
  URL.revokeObjectURL(url);
  toastCtx?.notify("Меню экспортировано в JSON", "success");
}

// --- Экспорт PHP ---
function menuToPHP(
  menu: MenuItem[],
  tpl: "ul" | "nav" | "div" = "ul",
  level = 0
): string {
  const tag = tpl === "ul" ? "ul" : tpl === "nav" ? "nav" : "div";
  const liTag = tpl === "ul" ? "li" : "div";
  let out = "";
  if (!menu || menu.length === 0) return "";
  out += `\n<${tag}>`;
  for (const item of menu) {
    out += `\n  <${liTag}`;
    if (item.className) out += ` class="${item.className}"`;
    out += ">";
    if (item.uri) {
      out += `<a href="${item.uri}">${item.text}</a>`;
    } else {
      out += item.text;
    }
    if (item.children && item.children.length > 0) {
      out += menuToPHP(item.children, tpl, level + 1);
    }
    out += `</${liTag}>`;
  }
  out += `\n</${tag}>`;
  return out;
}

function exportPHP(menu: MenuItem[], name: string, tpl: "ul" | "nav" | "div") {
  const php = `<?php\n// Автогенерированное меню\necho <<<HTML${menuToPHP(
    menu,
    tpl
  )}\nHTML;\n?>`;
  const blob = new Blob([php], { type: "text/x-php" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name || "menu"}.php`;
  a.click();
  URL.revokeObjectURL(url);
  toastCtx?.notify("Меню экспортировано в PHP", "success");
}

// Мини-шаблонизатор для PHP-экспорта меню
function renderMenuWithTemplate(items: any[], template: string): string {
  return items
    .map((item) => {
      let out = template;
      // Простая подстановка {{field}}
      Object.keys(item).forEach((key) => {
        if (key !== "children") {
          out = out.replaceAll(`{{${key}}}`, item[key] ?? "");
        }
      });
      // Условие {{#if children}} ... {{/if}}
      out = out.replace(/{{#if children}}([\s\S]*?){{\/if}}/g, (_, block) =>
        item.children && item.children.length > 0 ? block : ""
      );
      // Вложенность
      if (out.includes("{{children}}")) {
        out = out.replaceAll(
          "{{children}}",
          item.children && item.children.length > 0
            ? renderMenuWithTemplate(item.children, template)
            : ""
        );
      }
      return out;
    })
    .join("\n");
}

// --- Подсветка плейсхолдеров в шаблоне ---
function highlightTemplate(template: string) {
  // Один проход: сначала управляющие конструкции, потом children, потом остальные плейсхолдеры
  return template.replace(
    /({{#if [^}]+}}|{{\/if}}|{{children}}|{{[^}]+}})/g,
    (match) => {
      if (/^{{#if /.test(match))
        return `<span class="${styles.templateIf}">${match}</span>`;
      if (/^{{\/if}}$/.test(match))
        return `<span class="${styles.templateEndIf}">${match}</span>`;
      if (match === "{{children}}")
        return `<span class="${styles.templateChildren}">${match}</span>`;
      return `<span class="${styles.templatePlaceholder}">${match}</span>`;
    }
  );
}

const NAV_ITEMS = [
  { key: "list", label: "Список меню" },
  { key: "import", label: "Импорт" },
  { key: "export", label: "Экспорт" },
];

type NavKey = "list" | "import" | "export";

export const MenuConstructor: React.FC = () => {
  const [menuList, setMenuList] = useState<SavedMenu[]>([]);
  const [currentMenuId, setCurrentMenuId] = useState<string | null>(null);
  const [phpTpl, setPhpTpl] = useState<"ul" | "nav" | "div">("ul");
  const [nav, setNav] = useState<NavKey>("list");
  const [showMenuList, setShowMenuList] = useState<boolean>(true);
  const [newMenuName, setNewMenuName] = useState("");
  const [editingMenuId, setEditingMenuId] = useState<string | null>(null);
  const [editingMenuName, setEditingMenuName] = useState<string>("");
  const toastCtx = React.useContext(ToastContainerContext);
  const didInit = useRef(false);

  // --- Шаблон для PHP ---
  const [phpTemplate, setPhpTemplate] = useState<string>(
    `<li>
  <a href="{{uri}}">{{text}}</a>
  {{#if children}}
    <ul>
      {{children}}
    </ul>
  {{/if}}
</li>`
  );
  const [phpPreview, setPhpPreview] = useState<string>("");

  // --- Шаблоны пользователя ---
  const [templates, setTemplates] = useState<{ name: string; value: string }[]>(
    [{ name: "default", value: phpTemplate }]
  );
  const [selectedTemplate, setSelectedTemplate] = useState<string>("default");

  // Вычисляем текущее меню и имя
  const currentMenu = useMemo(
    () => menuList.find((m) => m.id === currentMenuId) || null,
    [menuList, currentMenuId]
  );
  const menu = currentMenu?.items || [];
  const menuName = currentMenu?.name || "Новое меню";

  // --- Live preview результата экспорта ---
  const [copied, setCopied] = useState(false);
  const handleCopyPreview = () => {
    navigator.clipboard.writeText(phpPreview);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  const CopyIcon = () => (
    <span className={styles.exportPreviewCopyIcon} title="Копировать">
      📋
    </span>
  );

  // Инициализация из localStorage
  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    const list = localStorage.getItem(MENU_LIST_KEY);
    const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
    let parsedMenuList: SavedMenu[] = [];
    let parsedMenuId = null;
    if (list) parsedMenuList = JSON.parse(list);
    if (saved) {
      const parsed = JSON.parse(saved);
      parsedMenuId = parsed.currentMenuId || null;
    }
    setMenuList(parsedMenuList);
    if (parsedMenuList.length > 0) {
      const found = parsedMenuList.find((m) => m.id === parsedMenuId);
      if (found) {
        setCurrentMenuId(parsedMenuId);
      } else {
        setCurrentMenuId(parsedMenuList[0].id);
      }
    } else {
      setCurrentMenuId(null);
    }
  }, []);

  // Сохраняем menuList и текущий выбор в localStorage при изменениях
  useEffect(() => {
    localStorage.setItem(MENU_LIST_KEY, JSON.stringify(menuList));
    localStorage.setItem(
      LOCAL_STORAGE_KEY,
      JSON.stringify({
        menu: menu,
        menuName: menuName,
        currentMenuId,
      })
    );
  }, [menuList, menu, menuName, currentMenuId]);

  // Загрузка шаблонов из localStorage
  useEffect(() => {
    const saved = localStorage.getItem(TEMPLATES_KEY);
    if (saved) {
      const arr = JSON.parse(saved);
      if (Array.isArray(arr) && arr.length > 0) {
        setTemplates(arr);
        setSelectedTemplate(
          arr.find((t) => t.name === selectedTemplate)
            ? selectedTemplate
            : arr[0].name
        );
      } else {
        setTemplates([{ name: "default", value: phpTemplate }]);
        setSelectedTemplate("default");
      }
    } else {
      setTemplates([{ name: "default", value: phpTemplate }]);
      setSelectedTemplate("default");
    }
    // eslint-disable-next-line
  }, []);

  // Сохраняем шаблоны при изменении
  useEffect(() => {
    if (templates.length === 0) {
      setTemplates([{ name: "default", value: phpTemplate }]);
      setSelectedTemplate("default");
      return;
    }
    localStorage.setItem(TEMPLATES_KEY, JSON.stringify(templates));
    if (!templates.find((t) => t.name === selectedTemplate)) {
      setSelectedTemplate(templates[0].name);
    }
  }, [templates]);

  // При выборе шаблона — подставлять его в textarea
  useEffect(() => {
    const found = templates.find((t) => t.name === selectedTemplate);
    if (found) setPhpTemplate(found.value);
    else if (templates.length > 0) setSelectedTemplate(templates[0].name);
  }, [selectedTemplate, templates]);

  // Сохранить как новый шаблон
  const handleSaveTemplate = () => {
    const name = prompt("Имя нового шаблона:", "custom");
    if (!name) return;
    if (templates.some((t) => t.name === name)) {
      alert("Шаблон с таким именем уже есть");
      return;
    }
    setTemplates([...templates, { name, value: phpTemplate }]);
    setSelectedTemplate(name);
  };
  // Переименовать шаблон
  const handleRenameTemplate = () => {
    if (selectedTemplate === "default") return;
    const name = prompt("Новое имя шаблона:", selectedTemplate);
    if (!name || name === selectedTemplate) return;
    if (templates.some((t) => t.name === name)) {
      alert("Шаблон с таким именем уже есть");
      return;
    }
    setTemplates((prev) =>
      prev.map((t) => (t.name === selectedTemplate ? { ...t, name } : t))
    );
    setSelectedTemplate(name);
  };
  // Удалить шаблон
  const handleDeleteTemplate = () => {
    if (selectedTemplate === "default") return;
    if (!window.confirm("Удалить этот шаблон?")) return;
    setTemplates(templates.filter((t) => t.name !== selectedTemplate));
    setSelectedTemplate("default");
  };

  // Изменение структуры меню
  const handleMenuChange = (newMenu: MenuItem[], forcedId?: string) => {
    const id = forcedId || currentMenuId;
    if (!id) return;
    setMenuList((prev) =>
      prev.map((m) => (m.id === id ? { ...m, items: newMenu } : m))
    );
  };

  // Создать новое меню
  const handleAddMenu = () => {
    const name = newMenuName.trim() || "Новое меню";
    const id = Date.now().toString();
    const newMenu: SavedMenu = { id, name, items: [] };
    setMenuList([newMenu, ...menuList]);
    setCurrentMenuId(id);
    setNav("list");
    setNewMenuName("");
    handleMenuChange([], id);
    toastCtx?.notify(`Меню "${name}" создано и выбрано`, "success");
  };

  // Загрузить меню из списка
  const handleLoadMenu = (id: string) => {
    setCurrentMenuId(id);
    setNav("list");
  };

  // Удалить меню из списка
  const handleDeleteMenu = (id: string) => {
    const found = menuList.find((m) => m.id === id);
    if (
      found &&
      window.confirm(`Удалить меню "${found.name}"? Это действие необратимо.`)
    ) {
      const updatedList = menuList.filter((m) => m.id !== id);
      setMenuList(updatedList);
      if (currentMenuId === id) {
        setCurrentMenuId(updatedList[0]?.id || null);
      }
      toastCtx?.notify(`Меню "${found.name}" удалено`, "error");
    }
  };

  // Только название для меню
  const handleMenuNameChange = (id: string, name: string) => {
    setMenuList(menuList.map((m) => (m.id === id ? { ...m, name } : m)));
    toastCtx?.notify(`Меню переименовано в "${name}"`, "info");
  };

  // Импортировать как новое меню
  const handleImportMenu = (items: MenuItem[], name?: string) => {
    const menuName = name || "Импортированное меню";
    const id = Date.now().toString();
    const newMenu: SavedMenu = { id, name: menuName, items };
    setMenuList((prev) => [newMenu, ...prev]);
    setCurrentMenuId(id);
    setNav("list");
    toastCtx?.notify(`Меню "${menuName}" импортировано и выбрано`, "success");
  };

  const handleGeneratePHP = () => {
    // Генерируем тело функции
    const functionBody = `function renderMenu($items) {\n    $out = '';\n    foreach ($items as $item) {\n        $out .= <<<HTML\n" . renderMenuItem($item) . "\nHTML;\n    }\n    return $out;\n}\n\nfunction renderMenuItem($item) {\n    $out = '';\n    // --- шаблон ниже ---\n    $out .= <<<HTML\n${phpTemplate}\nHTML;\n    return $out;\n}`;
    // Пример вызова
    const example = `// Использование:\necho '<ul>' . renderMenu($menuArray) . '</ul>';`;
    setPhpPreview(
      `<?php\n// Автогенерированная функция для вывода меню\n${functionBody}\n\n${example}\n?>`
    );
  };

  const handleDownloadPHP = () => {
    const blob = new Blob([phpPreview], { type: "text/x-php" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${menuName || "menu"}.php`;
    a.click();
    URL.revokeObjectURL(url);
    toastCtx?.notify("Меню экспортировано в PHP", "success");
  };

  return (
    <div className={styles.container}>
      {/* Левая колонка: меню сайта */}
      <nav className={styles.nav}>
        <div className={styles.title}>Конструктор меню</div>
        {/* Список меню с аккордеоном */}
        <div className={styles.menuList}>
          <button
            onClick={() => setShowMenuList((v) => !v)}
            className={nav === "list" ? styles.activeButton : styles.button}
          >
            <span>Список меню</span>
            <span className={styles.arrow}>{showMenuList ? "▾" : "▸"}</span>
          </button>
          {showMenuList && (
            <div className={styles.menuListContent}>
              <div className={styles.inputContainer}>
                <input
                  type="text"
                  value={newMenuName}
                  onChange={(e) => setNewMenuName(e.target.value)}
                  placeholder="Название нового меню"
                  className={styles.input}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleAddMenu();
                  }}
                />
                <button
                  onClick={handleAddMenu}
                  className={styles.addButton}
                  title="Создать меню"
                >
                  +
                </button>
              </div>
              <ul className={styles.menuListItems}>
                {menuList.map((m) => (
                  <li key={m.id} className={styles.menuItem}>
                    {editingMenuId === m.id ? (
                      <div style={{ position: 'relative', width: '100%' }}>
                        <input
                          type="text"
                          value={editingMenuName}
                          autoFocus
                          onChange={(e) => setEditingMenuName(e.target.value)}
                          onBlur={() => {
                            handleMenuNameChange(
                              m.id,
                              editingMenuName.trim() || m.name
                            );
                            setEditingMenuId(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              handleMenuNameChange(
                                m.id,
                                editingMenuName.trim() || m.name
                              );
                              setEditingMenuId(null);
                            } else if (e.key === "Escape") {
                              setEditingMenuId(null);
                            }
                          }}
                          className={styles.input}
                        />
                      </div>
                    ) : (
                      <div style={{ position: 'relative', width: '100%' }}>
                        <button
                          onClick={() => handleLoadMenu(m.id)}
                          onDoubleClick={() => {
                            setEditingMenuId(m.id);
                            setEditingMenuName(m.name);
                          }}
                          className={
                            currentMenuId === m.id
                              ? styles.activeItem
                              : styles.item
                          }
                          title="Двойной клик — переименовать"
                          style={{ width: '100%' }}
                        >
                          {m.name}
                        </button>
                        {currentMenuId === m.id && editingMenuId !== m.id && (
                          <button
                            onClick={() => handleDeleteMenu(m.id)}
                            className={styles.deleteButton}
                            title="Удалить меню"
                            style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', zIndex: 2 }}
                          >
                            ×
                          </button>
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        {/* Остальные пункты меню */}
        <button
          onClick={() => setNav("import")}
          className={nav === "import" ? styles.activeButton : styles.button}
        >
          Импорт
        </button>
        <button
          onClick={() => setNav("export")}
          className={nav === "export" ? styles.activeButton : styles.button}
        >
          Экспорт
        </button>
      </nav>
      {/* Правая часть: только редактор выбранного меню или импорт/экспорт */}
      <div className={styles.content}>
        {nav === "list" && currentMenuId && (
          <div className={styles.editorContainer}>
            <div className={styles.editor}>
              <h1 className={styles.title}>Редактор меню</h1>
              <MenuEditor value={menu} onChange={handleMenuChange} />
            </div>
          </div>
        )}
        {nav === "import" && (
          <div className={styles.importContainer}>
            <div className={styles.import}>
              <h1 className={styles.title}>Импорт меню</h1>
              <GoogleSheetsImport onImport={handleImportMenu} />
            </div>
          </div>
        )}
        {nav === "export" && (
          <div className={styles.exportContainer}>
            <div className={styles.export}>
              <h1 className={styles.title}>Экспорт меню</h1>
              <div className={styles.exportButtons}>
                <button
                  onClick={() => exportJSON(menu, menuName)}
                  className={styles.exportButton}
                  onMouseOver={(e) =>
                    (e.currentTarget.style.background = "#f7cad0")
                  }
                  onMouseOut={(e) =>
                    (e.currentTarget.style.background = "#eebbc3")
                  }
                >
                  Скачать JSON
                </button>
                <button
                  onClick={handleGeneratePHP}
                  className={styles.exportButton}
                  style={{ marginLeft: 8 }}
                >
                  Сгенерировать PHP
                </button>
              </div>
              <div style={{ margin: "16px 0" }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>
                  Шаблон PHP:
                </div>
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    alignItems: "center",
                    marginBottom: 8,
                  }}
                >
                  <select
                    value={selectedTemplate}
                    onChange={(e) => setSelectedTemplate(e.target.value)}
                    style={{
                      fontSize: 15,
                      borderRadius: 6,
                      padding: "4px 10px",
                    }}
                  >
                    {templates.map((t) => (
                      <option key={t.name} value={t.name}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={handleSaveTemplate}
                    style={{ borderRadius: 6, padding: "4px 10px" }}
                  >
                    Сохранить как…
                  </button>
                  <button
                    onClick={handleRenameTemplate}
                    disabled={selectedTemplate === "default"}
                    style={{ borderRadius: 6, padding: "4px 10px" }}
                  >
                    Переименовать
                  </button>
                  <button
                    onClick={handleDeleteTemplate}
                    disabled={selectedTemplate === "default"}
                    style={{ borderRadius: 6, padding: "4px 10px" }}
                  >
                    Удалить
                  </button>
                </div>
                <textarea
                  value={phpTemplate}
                  onChange={(e) => setPhpTemplate(e.target.value)}
                  rows={8}
                  style={{
                    width: "100%",
                    fontFamily: "monospace",
                    fontSize: 15,
                    borderRadius: 8,
                    border: "1.5px solid #e0e0e0",
                    padding: 8,
                    resize: "vertical",
                  }}
                />
              </div>
              {phpPreview && (
                <>
                  <div className={styles.exportPreviewHeader}>
                    <span>PHP предпросмотр:</span>
                    <button
                      className={styles.exportPreviewCopyIconBtn}
                      onClick={handleCopyPreview}
                      title="Копировать"
                    >
                      {copied ? "Скопировано!" : <CopyIcon />}
                    </button>
                  </div>
                  <pre
                    className={styles.exportPreview}
                    style={{ minHeight: 120 }}
                  >
                    {phpPreview}
                  </pre>
                  <button
                    onClick={handleDownloadPHP}
                    className={styles.exportButton}
                    style={{ marginTop: 8 }}
                  >
                    Скачать PHP
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
