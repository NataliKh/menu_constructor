import React, { useState, useRef, useEffect } from "react";
import type { MenuItem } from "../../entities/menu";
import styles from "./GoogleSheetsImport.module.css";
// SVG превью
const menuPreviewSvg = "/menu-preview.svg";
const csvPreviewSvg = "/csv-preview.svg";
const googleSheetsPreviewSvg = "/google-sheets-preview.svg";

interface GoogleSheetsImportProps {
  onImport: (items: MenuItem[], name?: string) => void;
}

// Рекурсивная фильтрация элементов с невалидным uri (null, пустая строка, undefined)
function filterInvalidUri(items: MenuItem[]): MenuItem[] {
  return items
    .filter(
      (item) =>
        typeof item.uri === "string" &&
        item.uri.trim() !== "" &&
        item.uri !== null
    )
    .map((item) => ({
      ...item,
      children: item.children ? filterInvalidUri(item.children) : undefined,
    }));
}

// Рекурсивно присваивает уникальные id всем элементам дерева
function assignUniqueIds(items: MenuItem[], prefix = ""): MenuItem[] {
  return items.map((item) => {
    const newId = `${prefix}${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    return {
      ...item,
      id: newId,
      children: item.children
        ? assignUniqueIds(item.children, newId + "-")
        : undefined,
    };
  });
}

// Универсальный парсер для Google Sheets: каждый столбец — уровень вложенности
function parseUniversalMenu(csv: string): {
  tree: MenuItem[];
  warnings: string[];
  parseError?: { line: number; content: string; message: string };
} {
  const lines = csv.trim().split(/\r?\n/);
  const rows = lines.map((line) =>
    line
      .split(/[;,\t]/)
      .map((s) => s.trim())
      .filter(Boolean)
  );
  const warnings: string[] = [];
  const tree: MenuItem[] = [];
  let parseError:
    | { line: number; content: string; message: string }
    | undefined = undefined;

  function addToTree(
    tree: MenuItem[],
    path: string[],
    level: number,
    lineIdx: number
  ) {
    if (path.length === 0) return;
    const value = path[0];
    const isUri = value.includes("/");
    let node: MenuItem | undefined = undefined;
    // Если это первый уровень и это uri — предупреждение
    if (isUri && level === 0) {
      warnings.push(
        `На верхнем уровне найден slug/uri "${value}". Обычно здесь должен быть текст.`
      );
    }
    // Ищем уже существующий узел
    for (const item of tree) {
      if ((isUri && item.uri === value) || (!isUri && item.text === value)) {
        node = item;
        break;
      }
    }
    if (!node) {
      node = {
        id: `${level}-${value}-${Math.random().toString(36).slice(2, 8)}`,
        text: isUri ? "" : value,
        uri: isUri ? value : "",
        children: [],
      };
      tree.push(node);
    } else {
      // Если у существующего узла не заполнен uri, а сейчас встретился slug — заполняем
      if (isUri && !node.uri) node.uri = value;
      // Если у существующего узла не заполнен текст, а сейчас встретился текст — заполняем
      if (!isUri && !node.text) node.text = value;
    }
    if (path.length > 1) {
      // Если uri встречается не на последнем уровне — предупреждение
      if (isUri && path.length > 1) {
        warnings.push(
          `Slug/uri "${value}" встречается не на последнем уровне (столбец ${
            level + 1
          }). Возможно, это ошибка структуры.`
        );
      }
      try {
        addToTree(node.children!, path.slice(1), level + 1, lineIdx);
      } catch {
        if (!parseError) {
          parseError = {
            line: lineIdx + 1,
            content: lines[lineIdx],
            message: "Parse error",
          };
        }
      }
    }
  }

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (row.length === 0) continue;
    try {
      addToTree(tree, row, 0, i);
    } catch {
      if (!parseError) {
        parseError = {
          line: i + 1,
          content: lines[i],
          message: "Parse error",
        };
      }
    }
  }
  return { tree, warnings, parseError };
}

// Корректный split CSV с учётом кавычек
function smartCsvSplit(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (char === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

// Новый парсер для формата ЖБИ77, строящий структуру как в 2.json
function parseJBI77Menu(csv: string): MenuItem[] {
  const lines = csv.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const result: MenuItem[] = [];
  let lastParent: MenuItem | null = null;
  let lastChild: MenuItem | null = null;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith("#N/A")) continue;
    const cols = smartCsvSplit(line);
    const [col1, col2, col3, col4, col5] = cols.map((s) =>
      s?.replace(/^"|"$/g, "").trim()
    );

    // Новый родитель (col1 не пустой и не slug)
    if (col1 && !col1.endsWith("/")) {
      const parentItem: MenuItem = {
        id: `${i}-parent`,
        text: col1,
        uri: "",
        image: "",
        icon: "",
        SVG: "default",
        children: [],
      };
      result.push(parentItem);
      lastParent = parentItem;
      lastChild = null;
      // Если есть дочерний
      if (col2 && col3 && lastParent) {
        const childItem: MenuItem = {
          id: `${i}-child`,
          text: col2,
          uri: col3,
          children: [],
        };
        lastParent.children!.push(childItem);
        lastChild = childItem;
      }
      continue;
    }

    // Если col1 — slug (uri для предыдущего родителя)
    if (col1 && col1.endsWith("/")) {
      if (lastParent && !col2 && !col3 && !col4 && !col5) {
        lastParent.uri = col1;
        // Если uri невалиден — удалить родителя
        if (
          !lastParent ||
          !lastParent.uri ||
          typeof lastParent.uri !== "string" ||
          lastParent.uri.trim() === "" ||
          lastParent.uri === null
        ) {
          result.pop();
          lastParent = null;
        }
        continue;
      }
      if (lastParent) lastParent.uri = col1;
      // Если есть дочерний
      if (col2 && col3) {
        const childItem: MenuItem = {
          id: `${i}-child`,
          text: col2,
          uri: col3,
          children: [],
        };
        lastParent.children!.push(childItem);
        lastChild = childItem;
      }
      // Если есть вложенный дочерний
      if (col4 && col5 && lastChild) {
        const subChildItem: MenuItem = {
          id: `${i}-subchild`,
          text: col4,
          uri: col5,
          children: [],
        };
        lastChild.children!.push(subChildItem);
      }
      continue;
    }

    // Если только дочерний (col2 и col3)
    if (!col1 && col2 && col3) {
      if (lastParent) {
        const childItem: MenuItem = {
          id: `${i}-child`,
          text: col2,
          uri: col3,
          children: [],
        };
        lastParent.children!.push(childItem);
        lastChild = childItem;
        // Если есть вложенный дочерний
        if (col4 && col5) {
          const subChildItem: MenuItem = {
            id: `${i}-subchild`,
            text: col4,
            uri: col5,
            children: [],
          };
          childItem.children!.push(subChildItem);
        }
      }
      continue;
    }

    // Если только вложенный дочерний (col4 и col5)
    if (!col1 && !col2 && !col3 && col4 && col5 && lastChild) {
      const subChildItem: MenuItem = {
        id: `${i}-subchild`,
        text: col4,
        uri: col5,
        children: [],
      };
      lastChild.children!.push(subChildItem);
      continue;
    }
  }

  return filterInvalidUri(result);
}

// Минималистичное дерево для импорта с независимым раскрытием веток
type MinimalMenuTreeProps = {
  items: MenuItem[];
  level?: number;
  openMap: Record<string, boolean>;
  onToggle: (id: string) => void;
};

function MinimalMenuTree({
  items,
  level = 0,
  openMap,
  onToggle,
}: MinimalMenuTreeProps) {
  if (!items || items.length === 0) return null;
  return (
    <ul
      style={{
        listStyle: "none",
        paddingLeft: level === 0 ? 0 : 18,
        margin: 0,
        marginTop: level === 0 ? 0 : 2,
        borderLeft: level === 0 ? "none" : "2px solid #e0e0e0",
      }}
    >
      {items.map((item) => (
        <li key={item.id} style={{ marginBottom: 4 }}>
          <span
            style={{
              fontWeight: 600,
              color: level === 0 ? "#232946" : "#555",
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            {item.children && item.children.length > 0 && (
              <span
                style={{
                  fontSize: 16,
                  color: "#b59f00",
                  userSelect: "none",
                  cursor: "pointer",
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggle(item.id);
                }}
              >
                {openMap[item.id] ? "▾" : "▸"}
              </span>
            )}
            {item.text || <em style={{ color: "#aaa" }}>(Без названия)</em>}
          </span>
          {openMap[item.id] && item.children && item.children.length > 0 && (
            <MinimalMenuTree
              items={item.children}
              level={level + 1}
              openMap={openMap}
              onToggle={onToggle}
            />
          )}
        </li>
      ))}
    </ul>
  );
}

// Функция преобразования обычной ссылки Google Sheets в CSV-ссылку
function googleSheetsUrlToCsv(url: string): string | null {
  // Поддержка ссылок вида .../d/{id}/...gid={gid}
  const match = url.match(/\/d\/([a-zA-Z0-9-_]+)\/.*[?&]gid=([0-9]+)/);
  if (match) {
    const [, id, gid] = match;
    return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`;
  }
  return null;
}

export const GoogleSheetsImport: React.FC<GoogleSheetsImportProps> = ({
  onImport,
}) => {
  const [raw, setRaw] = useState("");
  const [editable, setEditable] = useState<MenuItem[] | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [parseError, setParseError] = useState<{
    line: number;
    content: string;
    message: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [gsUrl, setGsUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const jsonFileInputRef = useRef<HTMLInputElement>(null);
  // Состояние раскрытия веток для MinimalMenuTree
  const [openMap, setOpenMap] = useState<Record<string, boolean>>({});

  const handleToggle = (id: string) => {
    setOpenMap((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleParse = () => {
    // const handleParse = () => {
    //   try {
    //     const { tree, warnings, parseError } = parseUniversalMenu(raw);
    //     setEditable(
    //       tree.map((item) => ({
    //         ...item,
    //         children: item.children?.map((c) => ({ ...c })),
    //       }))
    //     );
    //     setWarnings(warnings);
    //     setParseError(parseError || null);
    //     setError(null);
    //   } catch (e) {
    //     setError("Ошибка парсинга");
    //     setEditable(null);
    //     setWarnings([]);
    //     setParseError(null);
    //   }
    // };
  };

  const handleImport = () => {
    if (editable) {
      const now = new Date();
      const name = `Импортированное меню ${now.toLocaleDateString()} ${now
        .toLocaleTimeString()
        .slice(0, 5)}`;
      onImport(editable, name);
    }
  };

  const handleFetchGoogleSheet = async () => {
    setLoading(true);
    setError(null);
    setParseError(null);
    try {
      let url = gsUrl.trim();
      // Автоконвертация обычной ссылки в CSV-ссылку
      if (
        url.includes("docs.google.com/spreadsheets/d/") &&
        url.includes("gid=")
      ) {
        const converted = googleSheetsUrlToCsv(url);
        if (converted) url = converted;
      }
      const resp = await fetch(url);
      if (!resp.ok) throw new Error("Ошибка загрузки: " + resp.status);
      const text = await resp.text();
      setRaw(text);
      const tree = parseJBI77Menu(text);
      setEditable(tree);
      setWarnings([]);
      setParseError(null);
      setError(null);
    } catch (e) {
      setError("Ошибка загрузки Google Sheets");
      setEditable(null);
      setWarnings([]);
      setParseError(null);
    } finally {
      setLoading(false);
    }
  };

  // Импорт из JSON-файла (экспортированного)
  const handleImportJsonFile = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (Array.isArray(data)) {
        const filtered = filterInvalidUri(data);
        const withIds = assignUniqueIds(filtered);
        setEditable(withIds);
        setWarnings([]);
        setParseError(null);
        setError(null);
      } else {
        setError("Некорректный формат JSON: ожидался массив");
      }
    } catch (err) {
      setError(
        "Ошибка чтения или парсинга JSON-файла: " +
          (err instanceof Error ? err.message : String(err))
      );
    }
  };

  // Сброс раскрытия веток при загрузке нового меню
  useEffect(() => {
    setOpenMap({});
  }, [editable]);

  return (
    <div className={styles.container}>
      <div className={styles.subtitle}>
        Импорт меню из Google Sheets, CSV или JSON
      </div>
      <div className={styles.inputContainer}>
        <div className={styles.importGrid}>
          {/* JSON */}
          <div className={styles.importCard}>
            <img src={menuPreviewSvg} alt="Пример структуры меню" />
            <div className={styles.importCardTitle}>Импорт из JSON</div>
            <div className={styles.importCardDesc}>
              Файл с массивом объектов меню. Поддерживаются вложенности и id.
            </div>
            <a href="/menu-example.json" download>
              Скачать пример JSON
            </a>
            <button
              type="button"
              className={styles.importCardBtn}
              onClick={() => jsonFileInputRef.current?.click()}
            >
              Импортировать из JSON
            </button>
            <input
              ref={jsonFileInputRef}
              type="file"
              accept=".json,application/json"
              style={{ display: "none" }}
              onChange={handleImportJsonFile}
            />
          </div>
          {/* CSV */}
          <div className={styles.importCard}>
            <img src={csvPreviewSvg} alt="Пример структуры CSV" />
            <div className={styles.importCardTitle}>Импорт из CSV</div>
            <div className={styles.importCardDesc}>
              Таблица с колонками text, uri, SVG, ... для вложенности
              используйте text2, uri2 и т.д.
            </div>
            <a href="/csv-example.csv" download>
              Скачать пример CSV
            </a>
            <button
              type="button"
              className={styles.importCardBtn}
              onClick={() => fileInputRef.current?.click()}
            >
              Импортировать из файла (.csv)
            </button>
          </div>
          {/* Google Sheets */}
          <div className={styles.importCard}>
            <img
              src={googleSheetsPreviewSvg}
              alt="Пример структуры Google Sheets"
            />
            <div className={styles.importCardTitle}>
              Импорт из Google Sheets
            </div>
            <div className={styles.importCardDesc}>
              Вставьте ссылку на Google Sheets, где первая строка — заголовки,
              остальные — данные.
            </div>
            <input
              type="text"
              value={gsUrl}
              onChange={(e) => setGsUrl(e.target.value)}
              placeholder="Ссылка на Google Sheets (обычная или CSV)"
              className={styles.importCardInput}
              style={{ marginBottom: 4 }}
            />
            <div style={{ fontSize: 12, color: "#888", marginBottom: 4 }}>
              Можно вставлять обычную ссылку Google Sheets — конвертация в CSV
              происходит автоматически. Таблица должна быть доступна для всех.
            </div>
            <button
              onClick={handleFetchGoogleSheet}
              className={styles.importCardBtn}
              disabled={loading}
            >
              {loading ? "Загрузка..." : "Загрузить"}
            </button>
          </div>
        </div>
      </div>
      {error && (
        <div className={styles.errorContainer}>
          <span className={styles.errorIcon}>⛔</span> {error}
        </div>
      )}
      {parseError && (
        <div className={styles.errorContainer}>
          <span className={styles.errorIcon}>⛔</span> Ошибка парсинга (строка{" "}
          {parseError.line}): {parseError.message}
        </div>
      )}
      {warnings.length > 0 && (
        <div className={styles.warningContainer}>
          <span className={styles.warningIcon}>⚠️</span> {warnings.join(" ")}
        </div>
      )}
      {editable && (
        <div className={styles.marginTop16}>
          <div className={styles.fontWeight600}>Структура меню:</div>
          <MinimalMenuTree
            items={editable}
            openMap={openMap}
            onToggle={handleToggle}
          />
          <button onClick={handleImport} className={styles.marginTop16}>
            Импортировать в редактор
          </button>
        </div>
      )}
    </div>
  );
};
