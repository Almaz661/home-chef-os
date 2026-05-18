import { db, schema } from './index.js';

export async function runSeed() {
  // Create default user with PIN 1234
  const existingUsers = db.select().from(schema.users).all();
  if (existingUsers.length === 0) {
    db.insert(schema.users).values({
      pin: '1234',
      name: 'Семья',
    }).run();
    console.log('Default user created (PIN: 1234)');
  }

  // Add sample product categories
  const existingProducts = db.select().from(schema.productMaster).all();
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
    for (const p of products) {
      db.insert(schema.productMaster).values(p).run();
    }
    console.log(`Seeded ${products.length} products`);
  }

  // Add sample recipes
  const existingRecipes = db.select().from(schema.recipes).all();
  if (existingRecipes.length === 0) {
    const recipeId1 = db.insert(schema.recipes).values({
      title: 'Борщ классический',
      description: 'Традиционный украинский борщ с говядиной и свёклой',
      servings: 6,
      prepTime: 30,
      cookTime: 90,
      totalTime: 120,
      category: 'Супы',
      cuisine: 'Украинская',
      difficulty: 'medium',
      calories: 250,
    }).run().lastInsertRowid;

    const ingredients1 = [
      { recipeId: Number(recipeId1), name: 'Говядина', amount: 500, unit: 'г', sortOrder: 1 },
      { recipeId: Number(recipeId1), name: 'Свёкла', amount: 2, unit: 'шт', sortOrder: 2 },
      { recipeId: Number(recipeId1), name: 'Картофель', amount: 3, unit: 'шт', sortOrder: 3 },
      { recipeId: Number(recipeId1), name: 'Капуста', amount: 300, unit: 'г', sortOrder: 4 },
      { recipeId: Number(recipeId1), name: 'Морковь', amount: 1, unit: 'шт', sortOrder: 5 },
      { recipeId: Number(recipeId1), name: 'Лук', amount: 1, unit: 'шт', sortOrder: 6 },
      { recipeId: Number(recipeId1), name: 'Томатная паста', amount: 2, unit: 'ст.л.', sortOrder: 7 },
      { recipeId: Number(recipeId1), name: 'Чеснок', amount: 3, unit: 'зубчика', sortOrder: 8 },
      { recipeId: Number(recipeId1), name: 'Соль', amount: null, unit: 'по вкусу', sortOrder: 9 },
      { recipeId: Number(recipeId1), name: 'Перец чёрный', amount: null, unit: 'по вкусу', sortOrder: 10 },
      { recipeId: Number(recipeId1), name: 'Лавровый лист', amount: 2, unit: 'шт', sortOrder: 11 },
      { recipeId: Number(recipeId1), name: 'Сметана', amount: null, unit: 'для подачи', sortOrder: 12 },
    ];
    for (const ing of ingredients1) {
      db.insert(schema.recipeIngredients).values(ing).run();
    }

    const steps1 = [
      { recipeId: Number(recipeId1), stepNumber: 1, instruction: 'Поставить варить говядину в 3 литрах воды. Снять пену, варить 1 час.', timerMinutes: 60 },
      { recipeId: Number(recipeId1), stepNumber: 2, instruction: 'Натереть свёклу на крупной тёрке, обжарить с томатной пастой 10 минут.', timerMinutes: 10 },
      { recipeId: Number(recipeId1), stepNumber: 3, instruction: 'Нарезать картофель кубиками, добавить в бульон.' },
      { recipeId: Number(recipeId1), stepNumber: 4, instruction: 'Нашинковать капусту, добавить в кастрюлю через 10 минут после картофеля.' },
      { recipeId: Number(recipeId1), stepNumber: 5, instruction: 'Обжарить лук и морковь, добавить в борщ вместе со свёклой.' },
      { recipeId: Number(recipeId1), stepNumber: 6, instruction: 'Добавить чеснок, лавровый лист, соль и перец. Варить ещё 10 минут.', timerMinutes: 10 },
      { recipeId: Number(recipeId1), stepNumber: 7, instruction: 'Дать настояться 30 минут. Подавать со сметаной.' },
    ];
    for (const step of steps1) {
      db.insert(schema.recipeSteps).values(step).run();
    }

    const recipeId2 = db.insert(schema.recipes).values({
      title: 'Паста Карбонара',
      description: 'Итальянская паста с беконом, яйцами и пармезаном',
      servings: 2,
      prepTime: 10,
      cookTime: 20,
      totalTime: 30,
      category: 'Основные блюда',
      cuisine: 'Итальянская',
      difficulty: 'easy',
      calories: 450,
    }).run().lastInsertRowid;

    const ingredients2 = [
      { recipeId: Number(recipeId2), name: 'Спагетти', amount: 200, unit: 'г', sortOrder: 1 },
      { recipeId: Number(recipeId2), name: 'Бекон (гуанчиале)', amount: 150, unit: 'г', sortOrder: 2 },
      { recipeId: Number(recipeId2), name: 'Яйца', amount: 3, unit: 'шт', sortOrder: 3 },
      { recipeId: Number(recipeId2), name: 'Пармезан', amount: 50, unit: 'г', sortOrder: 4 },
      { recipeId: Number(recipeId2), name: 'Перец чёрный', amount: null, unit: 'по вкусу', sortOrder: 5 },
      { recipeId: Number(recipeId2), name: 'Соль', amount: null, unit: 'для воды', sortOrder: 6 },
    ];
    for (const ing of ingredients2) {
      db.insert(schema.recipeIngredients).values(ing).run();
    }

    const steps2 = [
      { recipeId: Number(recipeId2), stepNumber: 1, instruction: 'Отварить спагетти в подсоленной воде до состояния аль денте.', timerMinutes: 8 },
      { recipeId: Number(recipeId2), stepNumber: 2, instruction: 'Нарезать бекон кубиками и обжарить до хрустящей корочки.' },
      { recipeId: Number(recipeId2), stepNumber: 3, instruction: 'Смешать яйца с тёртым пармезаном и перцем.' },
      { recipeId: Number(recipeId2), stepNumber: 4, instruction: 'Снять сковороду с огня, добавить горячие спагетти к бекону.' },
      { recipeId: Number(recipeId2), stepNumber: 5, instruction: 'Быстро влить яичную смесь, интенсивно перемешивая. Подавать сразу.' },
    ];
    for (const step of steps2) {
      db.insert(schema.recipeSteps).values(step).run();
    }

    const recipeId3 = db.insert(schema.recipes).values({
      title: 'Сырники',
      description: 'Нежные сырники из творога с ванилью',
      servings: 4,
      prepTime: 15,
      cookTime: 15,
      totalTime: 30,
      category: 'Завтраки',
      cuisine: 'Русская',
      difficulty: 'easy',
      calories: 280,
    }).run().lastInsertRowid;

    const ingredients3 = [
      { recipeId: Number(recipeId3), name: 'Творог', amount: 500, unit: 'г', sortOrder: 1 },
      { recipeId: Number(recipeId3), name: 'Яйца', amount: 2, unit: 'шт', sortOrder: 2 },
      { recipeId: Number(recipeId3), name: 'Сахар', amount: 3, unit: 'ст.л.', sortOrder: 3 },
      { recipeId: Number(recipeId3), name: 'Мука', amount: 4, unit: 'ст.л.', sortOrder: 4 },
      { recipeId: Number(recipeId3), name: 'Ванильный сахар', amount: 1, unit: 'пакетик', sortOrder: 5 },
      { recipeId: Number(recipeId3), name: 'Растительное масло', amount: null, unit: 'для жарки', sortOrder: 6 },
      { recipeId: Number(recipeId3), name: 'Сметана', amount: null, unit: 'для подачи', sortOrder: 7 },
    ];
    for (const ing of ingredients3) {
      db.insert(schema.recipeIngredients).values(ing).run();
    }

    console.log('Seeded 3 sample recipes');
  }
}
