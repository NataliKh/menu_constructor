export interface MenuItem {
  id: string; // уникальный идентификатор
  text: string;
  uri?: string | null;
  image?: string; // url или base64
  icon?: string; // имя иконки или url
  className?: string; // css-класс для пункта
  levelClassName?: string; // css-класс для уровня вложенности
  SVG?: string; // имя SVG-иконки или SVG-код
  children?: MenuItem[];
}

export interface MenuTree {
  id: string; // уникальный идентификатор меню
  className?: string; // css-класс для всего меню
  levelClassNames?: string[]; // классы для разных уровней вложенности
  items: MenuItem[];
}
