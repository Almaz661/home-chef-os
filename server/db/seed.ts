import { db, schema } from './index.js';

/**
 * Idempotent seed for first-run state. Re-runs are safe — every block
 * checks "is this already populated?" before inserting.
 *
 * NOTE: рецепты больше не сидим вручную. С переходом на Neon рецепты
 * хранятся в БД постоянно — пользователь импортирует их через UI
 * (одиночный импорт или массовый импорт раздела) и они никуда не
 * пропадают между деплоями.
 */
export async function runSeed(): Promise<void> {
  // Default user (PIN 1234)
  const existingUsers = await db.select().from(schema.users).limit(1);
  if (existingUsers.length === 0) {
    await db.insert(schema.users).values({
      pin: '1234',
      name: 'Семья',
    });
    console.log('[seed] Default user created (PIN: 1234)');
  }

  // Product catalogue — small bootstrap so receipt-matching has something
  // to chew on right after first deploy.
  const existingProducts = await db.select().from(schema.productMaster).limit(1);
  if (existingProducts.length === 0) {
    const products = [
      { name: 'Молоко', nameNl: 'Melk', defaultUnit: 'л', category: 'Молочные' },
      { name: 'Яйца', nameNl: 'Eieren', defaultUnit: 'шт', category: 'Молочные' },
      { name: 'Хлеб', nameNl: 'Brood', defaultUnit: 'шт', category: 'Выпечка' },
      { name: 'Масло сливочное', nameNl: 'Boter', defaultUnit: 'г', category: 'Молочные' },
      { name: 'Сыр', nameNl: 'Kaas', defaultUnit: 'г', category: 'Молочные' },
      { name: 'Курица', nameNl: 'Kip', defaultUnit: 'г', category: 'Мясо' },
      { name: 'Говядина', nameNl: 'Rundvlees', defaultUnit: 'г', category: 'Мясо' },
      { name: 'Свинина', nameNl: 'Varkensvlees', defaultUnit: 'г', category: 'Мясо' },
      { name: 'Рис', nameNl: 'Rijst', defaultUnit: 'г', category: 'Крупы' },
      { name: 'Гречка', nameNl: 'Boekweit', defaultUnit: 'г', category: 'Крупы' },
      { name: 'Макароны', nameNl: 'Pasta', defaultUnit: 'г', category: 'Крупы' },
      { name: 'Картофель', nameNl: 'Aardappelen', defaultUnit: 'кг', category: 'Овощи' },
      { name: 'Морковь', nameNl: 'Wortelen', defaultUnit: 'шт', category: 'Овощи' },
      { name: 'Лук', nameNl: 'Uien', defaultUnit: 'шт', category: 'Овощи' },
      { name: 'Помидоры', nameNl: 'Tomaten', defaultUnit: 'шт', category: 'Овощи' },
      { name: 'Огурцы', nameNl: 'Komkommers', defaultUnit: 'шт', category: 'Овощи' },
      { name: 'Чеснок', nameNl: 'Knoflook', defaultUnit: 'шт', category: 'Овощи' },
      { name: 'Сахар', nameNl: 'Suiker', defaultUnit: 'г', category: 'Бакалея' },
      { name: 'Соль', nameNl: 'Zout', defaultUnit: 'г', category: 'Бакалея' },
      { name: 'Мука', nameNl: 'Bloem', defaultUnit: 'г', category: 'Бакалея' },
      { name: 'Растительное масло', nameNl: 'Plantaardige olie', defaultUnit: 'мл', category: 'Бакалея' },
      { name: 'Оливковое масло', nameNl: 'Olijfolie', defaultUnit: 'мл', category: 'Бакалея' },
      { name: 'Сметана', nameNl: 'Zure room', defaultUnit: 'г', category: 'Молочные' },
      { name: 'Творог', nameNl: 'Kwark', defaultUnit: 'г', category: 'Молочные' },
      { name: 'Яблоки', nameNl: 'Appels', defaultUnit: 'шт', category: 'Фрукты' },
      { name: 'Бананы', nameNl: 'Bananen', defaultUnit: 'шт', category: 'Фрукты' },
      { name: 'Лимон', nameNl: 'Citroen', defaultUnit: 'шт', category: 'Фрукты' },
      { name: 'Томатная паста', nameNl: 'Tomatenpuree', defaultUnit: 'г', category: 'Консервы' },
      { name: 'Соевый соус', nameNl: 'Sojasaus', defaultUnit: 'мл', category: 'Соусы' },
      { name: 'Перец чёрный', nameNl: 'Zwarte peper', defaultUnit: 'г', category: 'Специи' },
    ];
    await db.insert(schema.productMaster).values(products);
    console.log(`[seed] ${products.length} products`);
  }
}
