// Starter data for Meal Loop. Everything here is editable in the app.
// Module line format:
// cat|icon|name|makes|perCook|needsCooking(1/0)|rawDays|cookedDays|ingredients|storage|method
// Ingredients: name:amount:unit;name:amount:unit

const CATS = [
  { id: 'veg',   name: 'Vegetables', short: 'Sides',      icon: 'carrots',          bg: '#e4efdc', ink: '#2f6b3a', hint: 'Roasted, chopped, or tossed into a bowl.' },
  { id: 'pro',   name: 'Proteins',   short: 'Proteins',   icon: 'chicken',          bg: '#fde4dc', ink: '#a8432a', hint: 'What will keep you full?' },
  { id: 'fill',  name: 'Fillings',   short: 'Fillings',   icon: 'rice',             bg: '#fbeccb', ink: '#8a6414', hint: 'Grains, bread and starches.' },
  { id: 'flav',  name: 'Flavors',    short: 'Flavors',    icon: 'hot-honey',        bg: '#ece4f6', ink: '#5d3f8f', hint: 'Sauces and toppings that make it good.' },
  { id: 'fruit', name: 'Fruits',     short: 'Fruit',      icon: 'apples',           bg: '#fde2e4', ink: '#a8323f', hint: 'Fresh and easy.' },
  { id: 'meal',  name: 'Easy meals', short: 'Easy meals', icon: 'stir-fry',         bg: '#dde8f6', ink: '#35588f', hint: 'Whole meals and breakfasts for when you want zero effort.' },
  { id: 'snack', name: 'Snacks',     short: 'Snacks',     icon: 'popcorn',          bg: '#e8f1d8', ink: '#4f6b25', hint: 'Between-meal grabs.' },
  { id: 'treat', name: 'Treats',     short: 'Treats',     icon: 'cookies',          bg: '#fce0e0', ink: '#a03a3a', hint: 'Planned, so they stay a treat.' },
];

const SLOTS = [
  { id: 'breakfast', name: 'Breakfast', icon: 'cereal-milk' },
  { id: 'lunch',     name: 'Lunch',     icon: 'salad-bowl' },
  { id: 'dinner',    name: 'Dinner',    icon: 'stir-fry' },
  { id: 'snack',     name: 'Snack',     icon: 'popcorn' },
  { id: 'treat',     name: 'Treat',     icon: 'cookies' },
];

const STORAGE_DEFAULT = {
  veg: 'Keep in the crisper drawer. Wash right before using.',
  pro: 'Keep on the lowest shelf, sealed. Cook within the raw window.',
  fill: 'Store dry goods in a cool pantry. Cooked leftovers go in a sealed container in the fridge.',
  flav: 'Seal tightly and refrigerate after opening.',
  fruit: 'Keep dry. Refrigerate once ripe.',
  meal: 'Cool quickly, then refrigerate in a sealed container.',
  snack: 'Keep sealed and dry.',
  treat: 'Keep sealed so it stays fresh.',
};

const RAW = `
veg|carrots|Carrots|5|2|1|21|4|Carrots:5:ea|Fridge in a bag with a damp paper towel.|Peel and chop. Roast at 425°F for 20–25 min with oil and salt.
veg|brussels-sprouts|Brussels sprouts|4|4|1|7|4|Brussels sprouts:1:lb|Fridge, unwashed, in a loose bag.|Trim and halve. Roast at 425°F for 20–25 min until crisp at the edges.
veg|cucumber|Cucumber|3|3|0|7|0|Cucumbers:3:ea|Fridge, whole. Cut pieces keep 2 days wrapped.|Slice or spear. Salt lightly.
veg|butternut-squash|Butternut squash|4|4|1|14|4|Butternut squash:1:ea|Whole squash keeps in a cool pantry. Fridge once cut.|Peel, cube, roast at 425°F for 25–30 min.
veg|tomatoes|Tomatoes|4|4|0|7|0|Tomatoes:4:ea|Counter until ripe, then fridge.|Slice with salt and olive oil.
veg|tomato-cucumber-salad|Tomato + cucumber salad|4|4|0|4|0|Tomatoes:2:ea;Cucumbers:1:ea;Olive oil:2:tbsp|Fridge in a sealed container. Best within 2 days.|Chop everything, toss with oil and salt.
veg|green-beans|Green beans|4|4|1|7|4|Green beans:12:oz|Fridge in a bag, dry.|Trim. Sauté or roast for 10–12 min.
veg|bell-peppers|Bell peppers|3|3|0|10|0|Bell peppers:3:ea|Fridge crisper, uncut.|Slice into strips for dipping or bowls.
veg|broccoli|Broccoli|4|4|1|7|4|Broccoli crowns:2:ea|Fridge crisper, loose bag.|Cut into florets. Roast at 425°F for 15–20 min.
veg|sweet-potato|Sweet potato|4|4|1|21|4|Sweet potatoes:2:ea|Cool, dark pantry. Not the fridge raw.|Cube and roast at 425°F for 25 min, or bake whole at 400°F for 45 min.
veg|salad-greens|Salad greens|4|4|0|5|0|Salad greens:5:oz|Fridge with a paper towel in the container.|Wash and dry. Dress right before eating.
veg|spinach|Spinach|4|4|0|5|0|Spinach:5:oz|Fridge with a paper towel in the container.|Eat raw or wilt in a hot pan for 1–2 min.
pro|chicken|Chicken|4|4|1|2|4|Chicken breast:2:ea|Lowest shelf, sealed. Freeze if not cooking within 2 days.|Season, sear 5 min per side, then finish in a 400°F oven until 165°F inside.
pro|chickpeas|Chickpeas|4|4|1|730|4|Chickpeas:2:ea|Pantry unopened. Fridge once drained and roasted.|Drain, dry well, toss with oil and spices. Roast at 400°F for 25–30 min.
pro|eggs|Eggs|6|6|1|28|7|Eggs:6:ea|Fridge, in the carton.|Boil 10–11 min, then cool in ice water. Peel when needed.
pro|hummus|Hummus|6|6|0|7|0|Hummus:12:tbsp|Fridge, sealed. Smooth the top and add a film of oil.|Ready to eat.
pro|black-beans|Black beans|4|4|1|730|4|Black beans:2:ea|Pantry unopened. Fridge once opened.|Rinse, then warm with spices for 5–10 min.
pro|lentils|Lentils|4|4|1|365|5|Lentils (dry):1:cup|Dry in a pantry jar. Cooked in the fridge.|Rinse, simmer in 3 cups water for 20 min.
pro|salmon|Salmon|2|2|1|2|3|Salmon fillets:2:ea|Lowest shelf. Cook within 2 days.|Season, roast at 400°F for 10–12 min.
pro|tofu|Tofu|4|4|1|7|4|Tofu:1:ea|Fridge. Once opened, submerge in water and change daily.|Press 20 min, cube, bake at 400°F for 25 min.
pro|greek-yogurt|Greek yogurt|4|4|0|14|0|Greek yogurt:2:cup|Fridge, sealed.|Ready to eat.
pro|turkey|Turkey|4|4|0|5|0|Deli turkey:8:ea|Fridge, sealed. Use within 5 days of opening.|Ready to eat.
fill|mac-cheese|Mac & cheese|4|4|1|180|4|Pasta:8:oz;Cheese:8:oz;Milk:1:cup|Cool, then refrigerate in a sealed container.|Boil pasta, stir in milk and cheese over low heat until creamy.
fill|pita|Pita|4|4|0|7|0|Pita:4:ea|Counter 2 days, fridge after.|Warm for 20 seconds in a pan.
fill|rice|Rice|6|6|1|365|5|Rice:1.5:cup|Dry in a pantry. Cool cooked rice within 1 hour and refrigerate.|Rinse, simmer 1:2 with water, covered, for 15 min. Rest 5 min.
fill|pasta|Pasta|4|4|1|365|5|Pasta:8:oz|Dry in a pantry. Toss cooked pasta in a little oil before storing.|Boil in salted water until al dente.
fill|potatoes|Potatoes|4|4|1|21|4|Potatoes:4:ea|Cool, dark pantry.|Cube and roast at 425°F for 30 min, or boil 15 min.
fill|bread|Bread / toast|8|8|0|5|0|Bread:8:ea|Counter 3 days, freezer for longer.|Toast to your liking.
fill|ramen-noodles|Ramen / noodles|2|2|1|180|3|Ramen noodles:2:ea|Dry in a pantry.|Boil 3 min, drain, add sauce.
fill|tortillas|Tortillas|8|8|0|14|0|Tortillas:8:ea|Fridge after opening.|Warm in a dry pan for 15 seconds a side.
fill|couscous|Couscous|4|4|1|365|5|Couscous:1:cup|Dry in a pantry.|Pour over 1 cup boiling water, cover 5 min, fluff.
fill|bagels|Bagels|4|4|0|5|0|Bagels:4:ea|Counter 3 days. Slice and freeze for longer.|Toast.
fill|quinoa|Quinoa|4|4|1|365|5|Quinoa:1:cup|Dry in a pantry.|Rinse, simmer 1:2 for 15 min, fluff.
fill|other-grain|Other grain|4|4|1|365|5|Grain of choice:1:cup|Dry in a pantry.|Follow the package directions.
flav|hot-honey|Hot honey|4|4|0|365|0|Honey:4:tbsp;Hot sauce:2:tsp|Pantry, sealed.|Stir hot sauce into honey. Warm 15 seconds if thick.
flav|tahini-lemon|Tahini-lemon|4|4|0|7|0|Tahini:4:tbsp;Lemons:1:ea|Fridge, sealed. Stir before using.|Whisk tahini, lemon juice, water and salt until pourable.
flav|feta|Feta|4|4|0|21|0|Feta:4:oz|Fridge in brine, or wrapped dry.|Crumble over anything.
flav|tomato-sauce|Tomato sauce + Parmesan|4|4|1|7|5|Tomato sauce:2:cup;Parmesan:4:tbsp|Fridge once opened. Freezes well.|Warm gently. Finish with Parmesan.
flav|pesto|Pesto|4|4|0|14|0|Pesto:4:tbsp|Fridge, with a layer of oil on top.|Ready to eat.
flav|salsa|Salsa|4|4|0|14|0|Salsa:1:cup|Fridge once opened.|Ready to eat.
flav|soy-sesame|Soy-sesame|4|4|0|90|0|Soy sauce:4:tbsp;Sesame oil:1:tbsp|Pantry, sealed.|Whisk together.
flav|garlic-butter|Garlic butter|4|4|0|14|0|Butter:4:tbsp;Garlic:2:ea|Fridge, sealed.|Mash softened butter with minced garlic and salt.
flav|yogurt-sauce|Yogurt sauce|4|4|0|7|0|Greek yogurt:0.5:cup;Garlic:1:ea|Fridge, sealed.|Stir yogurt with garlic, salt and lemon.
flav|lemon-olive-oil|Lemon + olive oil|4|4|0|30|0|Lemons:1:ea;Olive oil:4:tbsp|Fridge, sealed. Oil may cloud when cold.|Whisk juice and oil with salt.
flav|hummus-sauce|Hummus|4|4|0|7|0|Hummus:8:tbsp|Fridge, sealed.|Ready to eat.
flav|favorite-dressing|Favorite dressing|4|4|0|60|0|Dressing:4:tbsp|Fridge once opened.|Shake and pour.
fruit|bananas|Bananas|5|5|0|5|0|Bananas:5:ea|Counter. Fridge slows browning once ripe.|Peel and eat.
fruit|apples|Apples|5|5|0|28|0|Apples:5:ea|Fridge crisper keeps them crisp.|Wash and slice.
fruit|strawberries|Strawberries|4|4|0|5|0|Strawberries:1:lb|Fridge, unwashed, paper towel in the container.|Wash right before eating.
fruit|blueberries|Blueberries|4|4|0|7|0|Blueberries:2:cup|Fridge, unwashed.|Wash right before eating.
fruit|grapes|Grapes|4|4|0|7|0|Grapes:1:lb|Fridge, unwashed, on the stem.|Rinse and pull off the stem.
fruit|mandarins|Mandarins|5|5|0|14|0|Mandarins:5:ea|Fridge crisper or cool counter.|Peel and eat.
fruit|peaches|Peaches / nectarines|4|4|0|5|0|Peaches:4:ea|Counter to ripen, then fridge.|Wash and slice.
fruit|melon|Melon|4|4|0|5|0|Melon:1:ea|Whole on the counter. Cut pieces in the fridge, covered.|Cube and store in a sealed container.
bfast|cereal-milk|Cereal + milk|4|4|0|180|0|Cereal:2:cup;Milk:2:cup|Cereal in a sealed bag. Milk in the fridge.|Pour and eat.
#merged into the Easy meals 'Eggs + toast':bfast|eggs-toast-b|Eggs + toast|2|2|1|5|3|Eggs:4:ea;Bread:4:ea|Fridge for the eggs.|Scramble or fry eggs. Toast the bread.
bfast|yogurt-fruit-granola|Yogurt + fruit + granola|4|4|0|7|0|Greek yogurt:2:cup;Mixed berries:2:cup;Granola:1:cup|Keep granola separate until serving.|Layer in a bowl or jar.
bfast|avocado-toast-egg|Avocado toast + egg|2|2|1|4|2|Avocados:1:ea;Eggs:2:ea;Bread:2:ea|Avocado on the counter until ripe, then fridge.|Mash avocado onto toast. Top with a fried or soft-boiled egg.
bfast|bagel-cream-cheese|Bagel + cream cheese|4|4|0|5|0|Bagels:4:ea;Cream cheese:4:tbsp|Fridge for the cream cheese.|Toast and spread.
bfast|oatmeal|Oatmeal + toppings|4|4|1|365|4|Oats:2:cup|Dry in a pantry. Cooked oatmeal keeps 4 days.|Simmer 1:2 with water or milk for 5 min.
bfast|purchased-breakfast|Purchased breakfast|1|1|0|2|0|Purchased breakfast:1:ea|Fridge if not eaten right away.|Ready to eat.
bfast|other-breakfast|Other breakfast|1|1|0|3|0|Breakfast item:1:ea||
meal|chicken-noodle-soup|Chicken noodle soup|4|4|1|5|4|Chicken breast:1:ea;Noodles:4:oz;Carrots:2:ea;Celery:2:ea;Broth:4:cup|Cool quickly. Freezes well without the noodles.|Simmer chicken in broth, shred, add vegetables and noodles.
meal|ramen-egg|Ramen + egg|2|2|1|180|1|Ramen noodles:2:ea;Eggs:2:ea|Eat fresh.|Boil noodles, add a soft-boiled egg.
meal|takeout|DIG / takeout|1|1|0|3|0|Takeout meal:1:ea|Fridge within 2 hours.|Reheat as needed.
meal|frozen-meal|Frozen meal|1|1|0|180|0|Frozen meal:1:ea|Freezer.|Heat per the package.
meal|quesadilla|Quesadilla|2|2|1|5|3|Tortillas:2:ea;Cheese:4:oz|Wrap cooked quesadillas well. Reheat in a pan.|Fill, then cook in a dry pan until crisp on both sides.
meal|cereal-dinner|Cereal dinner|1|1|0|180|0|Cereal:1:cup;Milk:1:cup|Pantry and fridge.|Pour. No judgment.
meal|eggs-toast|Eggs + toast|2|2|1|5|3|Eggs:4:ea;Bread:4:ea|Fridge for the eggs.|Scramble or fry. Toast the bread.
meal|soup-bread|Soup + bread|2|2|1|365|4|Soup:2:ea;Bread:2:ea|Pantry for cans. Fridge once opened.|Heat the soup. Toast the bread.
meal|pasta-sauce|Pasta + sauce|4|4|1|365|5|Pasta:8:oz;Tomato sauce:2:cup|Cool, then refrigerate sauced pasta.|Boil pasta, warm sauce, combine.
meal|stir-fry|Stir-fry|4|4|1|4|4|Chicken breast:1:ea;Mixed vegetables:1:lb;Soy sauce:3:tbsp|Cool quickly and refrigerate.|Slice chicken thin. Sear hot, add vegetables, finish with soy.
meal|salad-bowl|Salad bowl|2|2|0|4|0|Salad greens:5:oz;Tomatoes:2:ea;Cucumbers:1:ea;Dressing:2:tbsp|Keep dressing separate.|Toss just before eating.
meal|other-meal|Other easy meal|1|1|0|3|0|Easy meal:1:ea||
snack|apple-pb|Apple + peanut butter|4|4|0|7|0|Apples:4:ea;Peanut butter:4:tbsp|Cut apples brown. Slice just before eating.|Slice apples and serve with peanut butter.
snack|crackers-cheese|Crackers + cheese|4|4|0|14|0|Crackers:16:ea;Cheese:4:oz|Keep crackers sealed.|Stack and eat.
snack|hummus-veggies|Hummus + veggies/pita|4|4|0|7|0|Hummus:8:tbsp;Carrots:2:ea;Cucumbers:1:ea|Cut veggies keep 3 days in water or a damp towel.|Cut vegetables into sticks.
snack|yogurt|Yogurt|4|4|0|14|0|Yogurt cups:4:ea|Fridge.|Ready to eat.
snack|trail-mix|Trail mix / nuts|8|8|0|180|0|Trail mix:2:cup|Airtight in the pantry.|Scoop a handful.
snack|popcorn|Popcorn|4|4|0|90|0|Popcorn kernels:0.5:cup|Kernels dry in a pantry.|Pop on the stove in a lidded pot with oil.
snack|granola-bar|Granola bar|6|6|0|180|0|Granola bars:6:ea|Pantry.|Unwrap.
snack|fruit-snack|Fruit|4|4|0|7|0|Fresh fruit:4:ea|Fridge or counter by ripeness.|Wash and eat.
snack|cheese-fruit|Cheese + fruit|4|4|0|14|0|Cheese:4:oz;Grapes:0.5:lb|Fridge, wrapped.|Slice and plate.
snack|rice-cakes|Rice cakes|6|6|0|180|0|Rice cakes:6:ea|Pantry, sealed.|Top however you like.
snack|nut-butter-banana|Nut butter + banana|2|2|0|5|0|Nut butter:2:tbsp;Bananas:2:ea|Counter for bananas.|Slice banana, spread nut butter.
snack|other-snack|Other snack|1|1|0|7|0|Snack:1:ea||
treat|cookies|Cookies|8|8|0|7|0|Cookies:8:ea|Airtight on the counter.|Eat.
treat|ice-cream|Ice cream|4|4|0|90|0|Ice cream:1:pint|Freezer. Press parchment onto the surface.|Scoop.
treat|chocolate|Chocolate|6|6|0|180|0|Chocolate:6:oz|Cool, dry pantry.|Break off a square.
treat|brownie|Brownie|8|8|0|5|0|Brownies:8:ea|Airtight on the counter.|Eat.
treat|pastry|Pastry|2|2|0|2|0|Pastries:2:ea|Counter, loosely covered.|Warm briefly if you like.
treat|chips|Chips|6|6|0|60|0|Chips:1:ea|Clip the bag shut.|Pour into a bowl so you can see how many.
treat|candy|Candy|6|6|0|180|0|Candy:6:oz|Pantry.|Eat.
treat|seasonal|Something seasonal|1|1|0|5|0|Seasonal treat:1:ea||
treat|croissant|Croissant|2|2|0|2|0|Croissants:2:ea|Counter in paper, 2 days.|Warm at 300°F for 5 min.
treat|cake|Cake|6|6|0|4|0|Cake:1:ea|Covered, fridge if it has frosting or cream.|Slice.
treat|donut|Donut|4|4|0|2|0|Donuts:4:ea|Counter, loosely covered.|Eat.
treat|other-treat|Other treat|1|1|0|7|0|Treat:1:ea||
`;

function parseModules() {
  return RAW.trim().split('\n').map((line, i) => {
    if (line.startsWith('#')) return null; // commented-out lines still count, so ids stay stable
    const p = line.split('|');
    const [cat, icon, name, makes, per, cook, raw, cooked, ings, storage, method] = p;
    return {
      id: 'm' + (i + 1),
      cat: cat === 'bfast' ? 'meal' : cat, bf: cat === 'bfast', icon, name,
      makes: +makes, wk: +makes, per: +per, cook: cook === '1',
      raw: +raw, cooked: +cooked,
      ing: ings.split(';').map(s => { const [n, a, u] = s.split(':'); return { n, a: +a, u }; }),
      storage: storage || '', method: method || '',
    };
  }).filter(Boolean);
}

// How many to pick from each step when planning a week (editable in Settings; 0 means no target).
const DEFAULT_TARGETS = { veg: 3, pro: 2, fill: 2, flav: 2, fruit: 2, meal: 3, snack: 3, treat: 1 };

// name|unit -> [package label, how much one purchasable unit holds, in that unit]. The app calls every package a "unit".
const PACKS = {
  'Honey|tbsp': ['bottle', 24], 'Olive oil|tbsp': ['bottle', 34], 'Soy sauce|tbsp': ['bottle', 32],
  'Sesame oil|tbsp': ['bottle', 16], 'Tahini|tbsp': ['jar', 32], 'Pesto|tbsp': ['jar', 10],
  'Salsa|cup': ['jar', 3], 'Hummus|tbsp': ['tub', 20], 'Dressing|tbsp': ['bottle', 24],
  'Peanut butter|tbsp': ['jar', 36], 'Nut butter|tbsp': ['jar', 32], 'Eggs|ea': ['carton', 12],
  'Bread|ea': ['loaf', 20], 'Tortillas|ea': ['pack', 10], 'Butter|tbsp': ['pack', 32],
  'Tomato sauce|cup': ['jar', 3], 'Parmesan|tbsp': ['tub', 24], 'Cream cheese|tbsp': ['tub', 16],
  'Greek yogurt|cup': ['tub', 4], 'Milk|cup': ['carton', 8], 'Rice|cup': ['bag', 12],
  'Pasta|oz': ['box', 16], 'Hot sauce|tsp': ['bottle', 48], 'Oats|cup': ['canister', 14],
};

// Shelf life (days) for pantry staples when no single-ingredient module defines it.
const LIFE = {
  'Honey': 730, 'Olive oil': 365, 'Soy sauce': 365, 'Sesame oil': 365, 'Tahini': 180, 'Pesto': 14,
  'Salsa': 14, 'Hummus': 7, 'Dressing': 60, 'Peanut butter': 180, 'Nut butter': 180, 'Eggs': 28,
  'Bread': 5, 'Tortillas': 14, 'Butter': 60, 'Tomato sauce': 7, 'Parmesan': 60, 'Cream cheese': 14,
  'Greek yogurt': 14, 'Milk': 7, 'Rice': 365, 'Pasta': 365, 'Hot sauce': 365, 'Oats': 365,
  'Cheese': 21, 'Garlic': 30, 'Lemons': 21, 'Celery': 14, 'Broth': 5, 'Crackers': 90,
};

// Ingredient name -> icon, for ingredients that don't have a module of their own. First match wins.
const ICON_HINTS = [
  [/chicken/, 'chicken'], [/egg/, 'eggs'], [/salmon|fish/, 'salmon'], [/tofu/, 'tofu'], [/turkey|deli/, 'turkey'],
  [/chickpea|garbanzo/, 'chickpeas'], [/green bean/, 'green-beans'], [/black bean|beans/, 'black-beans'], [/lentil/, 'lentils'], [/hummus|baba/, 'hummus'],
  [/honey|hot sauce/, 'hot-honey'], [/peanut|nut butter|almond/, 'apple-pb'], [/olive oil|lemon|lime|vinegar/, 'lemon-olive-oil'], [/butter|garlic/, 'garlic-butter'],
  [/soy|sesame/, 'soy-sesame'], [/tahini/, 'tahini-lemon'], [/pesto|basil/, 'pesto'], [/salsa/, 'salsa'], [/tomato sauce|pasta sauce|marinara/, 'tomato-sauce'],
  [/cream cheese|bagel/, 'bagel-cream-cheese'], [/parmesan|feta|cheese/, 'feta'], [/greek yogurt|yogurt|sour cream/, 'greek-yogurt'], [/milk|cereal/, 'cereal-milk'],
  [/bread|toast/, 'bread'], [/tortilla/, 'tortillas'], [/pita/, 'pita'], [/rice/, 'rice'], [/quinoa/, 'quinoa'], [/couscous/, 'couscous'],
  [/pasta|linguine|spaghetti|noodle|macaroni/, 'pasta'], [/oat|granola/, 'oatmeal'], [/sweet potato/, 'sweet-potato'], [/potato/, 'potatoes'],
  [/banana/, 'bananas'], [/apple/, 'apples'], [/strawberr/, 'strawberries'], [/berr/, 'blueberries'], [/grape/, 'grapes'], [/peach|nectarine/, 'peaches'],
  [/mandarin|orange|citrus/, 'mandarins'], [/melon/, 'melon'], [/carrot/, 'carrots'], [/broccoli/, 'broccoli'], [/butternut|squash/, 'butternut-squash'],
  [/spinach/, 'spinach'], [/parsley|cilantro|herb|kale|greens|lettuce|celery|onion|leek|scallion/, 'salad-greens'], [/cucumber/, 'cucumber'], [/tomato/, 'tomatoes'],
  [/pepper(?!corn)/, 'bell-peppers'], [/brussels/, 'brussels-sprouts'], [/cumin|spice|salt|paprika|cinnamon|oregano|seed|pepper/, 'other-grain'],
  [/soup|broth|stock/, 'chicken-noodle-soup'], [/cookie/, 'cookies'], [/chip/, 'chips'], [/popcorn/, 'popcorn'], [/trail|nut/, 'trail-mix'],
  [/ice cream/, 'ice-cream'], [/chocolate/, 'chocolate'], [/candy/, 'candy'],
];
