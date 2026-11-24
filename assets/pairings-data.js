// ─────────────────────────────────────────────────────────────────
// SIDE KICK DATA — "what goes with what I'm making?"
//
// How a dish is read:
//   1. PAIR_STYLE_KEYWORDS: words in the dish name -> a style
//      (italian, mexican, asian, ...). First match wins, so the more
//      specific words sit higher in the list.
//   2. PAIR_CONTAINS: words that mean the dish already brings a
//      veggie / carb / protein, so the tool can say "you've got that
//      covered" and fill in what the plate is missing.
//   3. A family recipe picked from the list maps through its cuisine
//      tag (CUISINE_TO_STYLE) when its title has no keyword match.
//
// PAIR_SIDES[style][type] = list of
//   { name, why, seasonal?: [SEASONAL_PRODUCE keywords], recipeId?: family recipe id }
// Items are listed best-first; in-season items and family recipes get
// bumped up. A side that repeats a main ingredient of the dish (rice
// with fried rice, chicken with chicken) is skipped.
// ─────────────────────────────────────────────────────────────────

const PAIR_TYPES = [
  { value: "veggie",  label: "🥦 Veggie",  noun: "veggie" },
  { value: "carb",    label: "🥖 Carb",    noun: "carb" },
  { value: "protein", label: "🍗 Protein", noun: "protein" }
];

const PAIR_STYLE_LABELS = {
  italian: "Italian", mexican: "Mexican", asian: "Asian", indian: "Indian",
  mediterranean: "Greek & Mediterranean", bbq: "Grill & BBQ", classic: "Classic American dinner",
  seafood: "Seafood", french: "French", caribbean: "Caribbean & Latin",
  southern: "Southern & Cajun", soup: "Soup & stew", breakfast: "Breakfast & brunch", sandwich: "Sandwich", salad: "Salad"
};

const CUISINE_TO_STYLE = {
  italian: "italian", mexican: "mexican", asian: "asian", greek: "mediterranean",
  irish: "classic", french: "french", american: "classic", caribbean: "caribbean"
};

// [style, words]. A dish is matched against every list (typos are fixed
// first, see PAIR_EXTRA_VOCAB). The best match wins: a specific dish word
// beats a generic ingredient (PAIR_GENERIC_WORDS), a longer match beats a
// shorter one, and on a tie the style listed higher wins.
const PAIR_STYLE_KEYWORDS = [
  ["breakfast", ["pancake", "waffle", "french toast", "omelet", "omelette", "frittata", "quiche", "scrambled", "scrambled eggs", "fried eggs", "eggs benedict", "benedict", "breakfast", "brunch", "cinnamon roll", "eggs", "scone", "muffin", "oatmeal", "overnight oats", "granola", "bagel", "jam", "crepe", "hash brown", "hashbrown", "shakshuka", "huevos rancheros", "grits", "biscuits and gravy", "chicken and waffles", "yogurt", "parfait", "smoothie", "avocado toast", "porridge", "dutch baby", "strata", "breakfast burrito", "breakfast sandwich", "egg sandwich", "bacon and eggs", "steak and eggs", "danish", "coffee cake", "doughnut", "donut", "chia pudding", "acai bowl"]],
  ["soup", ["soup", "stew", "chili", "chowder", "bisque", "pho", "ramen", "minestrone", "pasta e fagioli", "wedding soup", "matzo ball", "gazpacho", "pozole", "posole", "tortilla soup", "goulash", "beef stew", "lentil soup", "split pea", "french onion", "broth", "egg drop", "wonton soup", "hot and sour", "tom yum", "tom kha", "congee", "bouillabaisse", "cioppino", "borscht", "chicken noodle", "zuppa", "ribollita", "avgolemono", "mulligatawny", "laksa", "udon soup"]],
  ["salad", ["salad", "caesar", "cobb", "wedge", "chopped salad", "grain bowl", "buddha bowl", "power bowl", "nicoise", "caprese", "panzanella", "waldorf", "tabbouleh", "fattoush", "slaw"]],
  ["sandwich", ["sandwich", "grilled cheese", "blt", "panini", "sub", "hoagie", "hero", "grinder", "wrap", "sloppy joe", "reuben", "club", "cheesesteak", "philly", "french dip", "po boy", "po' boy", "banh mi", "cuban sandwich", "melt", "tuna melt", "patty melt", "pb&j", "peanut butter and jelly", "lobster roll", "chicken salad sandwich", "egg salad", "monte cristo", "muffuletta", "toastie", "pita pocket", "pulled pork sandwich", "meatball sub", "chicken sandwich"]],
  ["indian", ["curry", "tikka", "masala", "tikka masala", "butter chicken", "korma", "vindaloo", "dal", "dahl", "daal", "biryani", "tandoori", "paneer", "saag", "palak", "chana", "chole", "aloo gobi", "samosa", "pakora", "rogan josh", "jalfrezi", "makhani", "dosa", "idli", "naan", "keema", "kofta", "indian", "madras", "bhuna", "pav bhaji", "khichdi"]],
  ["mexican", ["taco", "burrito", "quesadilla", "enchilada", "fajita", "nacho", "carnitas", "tamale", "chimichanga", "tostada", "mexican", "taquito", "flauta", "carne asada", "al pastor", "barbacoa", "birria", "mole", "chilaquiles", "elote", "sopes", "gordita", "chalupa", "torta", "tex mex", "tex-mex", "street corn", "spanish rice", "mexican rice", "burrito bowl", "taco salad", "queso", "chile relleno", "chiles rellenos", "pozole", "huevos", "tinga", "pollo asado", "fish taco", "shrimp taco", "migas"]],
  ["caribbean", ["jerk", "rice and beans", "rice & beans", "plantain", "empanada", "ropa vieja", "arroz", "arroz con pollo", "mojo", "cuban", "caribbean", "picadillo", "pernil", "lechon", "tostones", "maduros", "mofongo", "sofrito", "pastelon", "curry goat", "oxtail", "ackee", "saltfish", "roti", "jamaican", "puerto rican", "dominican", "peruvian", "lomo saltado", "ceviche", "arepa", "pupusa", "chimichurri", "churrasco", "brazilian", "feijoada", "colombian", "venezuelan", "argentinian", "pabellon", "sancocho", "tamal"]],
  ["asian", ["pad tai", "stir fry", "stir-fry", "fried rice", "lo mein", "chow mein", "pad thai", "pad see ew", "drunken noodles", "teriyaki", "dumpling", "potsticker", "gyoza", "wonton", "orange chicken", "general tso", "kung pao", "kung pow", "katsu curry", "japanese curry", "tofu", "sesame chicken", "sesame", "sweet and sour", "mongolian beef", "beef and broccoli", "broccoli beef", "cashew chicken", "egg roll", "spring roll", "bao", "char siu", "peking duck", "mapo tofu", "dan dan", "bulgogi", "bibimbap", "galbi", "kalbi", "japchae", "kimchi", "tteokbokki", "korean bbq", "katsu", "tonkatsu", "sushi", "sashimi", "poke", "donburi", "oyakodon", "yakitori", "tempura", "udon", "soba", "yakisoba", "miso", "noodle", "noodles", "pho", "banh", "bun cha", "larb", "satay", "green curry", "red curry", "massaman", "panang", "thai", "korean", "chinese", "japanese", "vietnamese", "filipino", "adobo", "pancit", "lumpia", "sinigang", "asian", "hibachi", "rice bowl", "lettuce wraps", "honey walnut shrimp", "szechuan", "sichuan", "hunan", "fried tofu", "bok choy"]],
  ["mediterranean", ["gyro", "souvlaki", "shawarma", "falafel", "kebab", "kabob", "kebob", "kofta", "moussaka", "spanakopita", "pastitsio", "greek", "hummus", "tagine", "mediterranean", "lamb", "lamb chops", "leg of lamb", "dolma", "dolmades", "shakshuka", "baba ganoush", "tabbouleh", "pita", "middle eastern", "lebanese", "turkish", "moroccan", "israeli", "persian", "kibbeh", "mujadara", "chicken shawarma", "tzatziki", "halloumi", "couscous", "paella", "spanish", "tapas", "patatas bravas", "gambas", "chorizo"]],
  ["italian", ["pasta", "spaghetti", "penne", "rigatoni", "linguine", "fettuccine", "fettucine", "tagliolini", "tagliatelle", "pappardelle", "orecchiette", "farfalle", "fusilli", "rotini", "bucatini", "cavatelli", "orzo", "tortellini", "manicotti", "stuffed shells", "lasagna", "lasagne", "ravioli", "gnocchi", "risotto", "parm", "parmesan", "parmigiana", "eggplant parm", "chicken parm", "veal parm", "marsala", "piccata", "francese", "saltimbocca", "scaloppine", "milanese", "cacciatore", "osso buco", "meatball", "sunday sauce", "sunday gravy", "marinara", "bolognese", "ragu", "alfredo", "carbonara", "cacio e pepe", "amatriciana", "puttanesca", "arrabbiata", "vodka", "alla vodka", "pesto", "primavera", "aglio e olio", "scampi", "frutti di mare", "pizza", "pizza bagel", "calzone", "stromboli", "flatbread", "pastina", "ziti", "baked ziti", "italian", "zucchini pie", "ratatouille", "polenta", "arancini", "braciole", "porchetta", "sausage and peppers", "eggplant rollatini", "lemon chicken", "chicken scarpariello", "bruschetta", "focaccia"]],
  ["french", ["coq au vin", "bourguignon", "boeuf", "cassoulet", "croque", "croque monsieur", "provencal", "provençal", "french", "au poivre", "steak frites", "frites", "duck confit", "confit", "bouillabaisse", "quiche lorraine", "souffle", "crepes", "gratin", "blanquette", "coquilles", "moules", "escargot", "sole meuniere", "meuniere", "beurre blanc", "chicken dijon", "dijon", "tarte", "galette", "pot au feu", "chateaubriand", "beef wellington", "wellington"]],
  ["southern", ["fried chicken", "chicken fried steak", "country fried", "shrimp and grits", "jambalaya", "gumbo", "etouffee", "étouffée", "cajun", "creole", "red beans", "dirty rice", "hush puppies", "catfish", "crawfish", "low country boil", "seafood boil", "boil", "collard", "chicken and dumplings", "biscuits", "southern", "soul food", "hoppin john", "fried green tomatoes", "nashville hot", "hot chicken", "fried fish", "fish fry", "po boy", "blackened"]],
  ["seafood", ["salmon", "shrimp", "scallop", "cod", "tilapia", "halibut", "tuna", "fish", "crab", "crab cakes", "lobster", "mussels", "clams", "oysters", "seafood", "mahi", "mahi mahi", "swordfish", "sea bass", "branzino", "trout", "flounder", "snapper", "haddock", "sole", "grouper", "ahi", "tuna steak", "salmon steak", "fish and chips", "calamari", "squid", "octopus", "prawns", "lobster tail", "surf and turf", "linguine with clams", "fish cakes", "salmon cakes", "cedar plank"]],
  ["bbq", ["hamburger", "cheeseburger", "burger", "smash burger", "sliders", "hot dog", "brats", "bratwurst", "ribs", "baby back", "spare ribs", "brisket", "pulled pork", "bbq", "barbecue", "barbeque", "kabobs", "wings", "buffalo wings", "chicken wings", "steak", "ribeye", "rib eye", "sirloin", "filet", "filet mignon", "new york strip", "strip steak", "t-bone", "porterhouse", "flank steak", "skirt steak", "tri tip", "tri-tip", "london broil", "tomahawk", "smoked", "cookout", "pork belly", "burnt ends", "grilled", "grilled chicken", "grilled steak", "grilled pork", "bbq chicken", "corn dog", "chili dog", "beer can chicken", "veggie burger", "turkey burger", "salmon burger", "rack of ribs"]],
  ["classic", ["roast", "roast chicken", "rotisserie", "turkey", "meatloaf", "pot roast", "pork chop", "pork tenderloin", "pork loin", "pork roast", "prime rib", "roast beef", "chicken", "chicken breast", "chicken thighs", "drumsticks", "pot pie", "chicken pot pie", "casserole", "tuna casserole", "green bean casserole", "mac and cheese", "mac & cheese", "macaroni", "ham", "glazed ham", "thanksgiving", "shepherd", "shepherd's pie", "shepherds pie", "shepards pie", "shepard's pie", "baked potato", "loaded potato", "potato", "cottage pie", "beef", "pork", "salisbury steak", "swedish meatballs", "stroganoff", "beef stroganoff", "chicken tenders", "chicken nuggets", "chicken fingers", "cutlets", "schnitzel", "baked chicken", "stuffed peppers", "stuffed bell peppers", "zucchini boats", "cabbage rolls", "corned beef", "corned beef and cabbage", "bangers and mash", "irish", "sloppy joes", "tater tot", "hotdish", "chicken divan", "lemon pepper chicken", "honey garlic chicken", "sheet pan", "crockpot", "slow cooker", "instant pot", "duck", "cornish hen", "venison", "meat pie", "pierogi", "kielbasa", "sausage", "brisket dinner", "christmas dinner", "easter", "sunday dinner"]]
];

// Cooking-method words rank below even generic ingredients: "grilled salmon" is seafood.
const PAIR_METHOD_WORDS = ["grilled", "smoked", "roast", "baked", "sheet pan", "crockpot", "slow cooker", "instant pot", "boil"];

// Ingredient or cooking words that say little about the style on their own
// ("chicken" fits every cuisine), so any specific dish word beats them.
const PAIR_GENERIC_WORDS = ["potato", "eggs", "chicken", "chicken breast", "chicken thighs", "drumsticks", "beef", "pork", "steak", "turkey", "ham", "lamb", "duck", "fish", "salmon", "shrimp", "cod", "tuna", "tilapia", "sausage", "chorizo", "noodle", "noodles", "grilled", "smoked", "roast", "sheet pan", "crockpot", "slow cooker", "instant pot", "sesame", "tofu", "vodka", "dijon", "boil", "biscuits", "pita", "couscous", "flatbread", "broth", "melt", "club", "hero", "wedge", "slaw", "lemon chicken", "bok choy", "egg sandwich", "jam"];

// What a dish already brings. Words are checked on the (typo-fixed) dish name.
const PAIR_CONTAINS = {
  protein: ["chicken", "roast", "coq au vin", "bourguignon", "stew", "hamburger", "cheeseburger", "beef", "steak", "ribeye", "sirloin", "filet", "brisket", "pork", "bacon", "pancetta", "prosciutto", "turkey", "salmon", "shrimp", "prawns", "fish", "tuna", "cod", "tilapia", "halibut", "trout", "snapper", "mahi", "swordfish", "scallop", "crab", "lobster", "clam", "clams", "mussels", "oysters", "calamari", "catfish", "crawfish", "seafood", "meatball", "meatloaf", "sausage", "kielbasa", "chorizo", "brats", "bratwurst", "pepperoni", "blt", "ham", "lamb", "veal", "duck", "venison", "tofu", "tempeh", "seitan", "egg", "eggs", "omelet", "omelette", "frittata", "quiche", "shakshuka", "benedict", "beans", "black beans", "chickpea", "lentil", "dal", "dahl", "daal", "chana", "chole", "burger", "sliders", "ribs", "chili", "pulled pork", "carnitas", "carne asada", "al pastor", "barbacoa", "birria", "bolognese", "ragu", "sunday sauce", "sunday gravy", "carbonara", "paneer", "gyro", "souvlaki", "shawarma", "falafel", "kebab", "kabob", "kofta", "hot dog", "wings", "bulgogi", "galbi", "katsu", "teriyaki", "jerk", "oxtail", "pernil", "lechon", "pollo", "lumpia", "moussaka", "corn dog", "ropa vieja", "picadillo", "stroganoff", "pot pie", "schnitzel", "cutlets", "parm", "parmigiana", "piccata", "marsala", "francese", "saltimbocca", "milanese", "cacciatore", "sushi", "sashimi", "poke", "halloumi", "cheesesteak", "reuben", "jambalaya", "gumbo", "etouffee", "tinga", "tikka", "korma", "vindaloo", "butter chicken", "tandoori", "adobo", "scampi", "chicken salad", "egg salad", "tuna melt", "patty melt", "pb&j", "peanut butter", "sloppy joe", "lobster roll", "crab cakes", "salmon cakes", "fish cakes", "surf and turf", "prime rib", "corned beef", "bangers", "pierogi"],
  carb: ["pasta", "hamburger", "cheeseburger", "spaghetti", "penne", "rigatoni", "linguine", "fettuccine", "fettucine", "tagliolini", "tagliatelle", "pappardelle", "orecchiette", "farfalle", "fusilli", "rotini", "bucatini", "cavatelli", "orzo", "tortellini", "manicotti", "stuffed shells", "lasagna", "lasagne", "ravioli", "gnocchi", "risotto", "pastina", "ziti", "mac", "macaroni", "carbonara", "alfredo", "cacio e pepe", "noodle", "lo mein", "chow mein", "pad thai", "pad tai", "pad see ew", "udon", "soba", "yakisoba", "japchae", "pancit", "ramen", "pho", "rice", "biryani", "congee", "paella", "jambalaya", "risotto", "grits", "polenta", "couscous", "potato", "potatoes", "fries", "frites", "hash brown", "hashbrown", "tater tot", "gratin", "pierogi", "bread", "toast", "sandwich", "grilled cheese", "blt", "panini", "sub", "hoagie", "hero", "grinder", "wrap", "reuben", "cheesesteak", "melt", "banh mi", "po boy", "torta", "arepa", "pupusa", "burger", "sliders", "hot dog", "taco", "burrito", "quesadilla", "enchilada", "tostada", "tamale", "taquito", "flauta", "chalupa", "gordita", "chilaquiles", "nacho", "pizza", "calzone", "stromboli", "flatbread", "focaccia", "pita", "naan", "roti", "dosa", "pancake", "waffle", "french toast", "crepe", "bagel", "biscuits", "scone", "muffin", "danish", "doughnut", "donut", "cinnamon roll", "oatmeal", "overnight oats", "granola", "dumpling", "potsticker", "gyoza", "wonton", "bao", "egg roll", "spring roll", "empanada", "samosa", "pot pie", "meat pie", "shepherd", "cottage pie", "shepards pie", "shepherds pie", "sloppy joe", "dressing", "stuffing", "gyro", "zucchini pie", "croque", "quiche", "galette", "tarte", "wellington", "pb&j", "lobster roll", "chicken and dumplings", "chicken and waffles", "fish and chips", "mofongo", "arroz", "corn dog", "chili dog", "lumpia", "tostones", "plantain", "mujadara", "hushpuppies", "hush puppies", "dirty rice", "fried rice", "rice bowl", "burrito bowl", "grain bowl", "donburi", "bibimbap", "poke"],
  veggie: ["salad", "vegetable", "vegetables", "veggie", "veggies", "broccoli", "zucchini", "spinach", "kale", "peppers", "bell pepper", "stuffed peppers", "stir fry", "stir-fry", "ratatouille", "green bean", "asparagus", "squash", "butternut", "eggplant", "cauliflower", "aloo gobi", "mushroom", "saag", "palak", "primavera", "spring vegetables", "caesar", "cobb", "wedge", "caprese", "brussels", "cabbage", "kimchi", "bok choy", "collard", "okra", "slaw", "tomato soup", "minestrone", "vegetable soup", "gazpacho", "fajita", "beef and broccoli", "broccoli beef", "lettuce wraps", "spanakopita", "tabbouleh", "fattoush", "baba ganoush", "elote", "carrot", "sweet potato", "pumpkin", "artichoke", "beet", "leek", "pea", "peas", "edamame"]
};

// Main-ingredient words: a side that shares one with the dish is skipped.
const PAIR_SHARED_WORDS = ["burger", "rice", "potato", "pasta", "noodle", "bread", "beans", "chicken", "beef", "steak", "pork", "salmon", "shrimp", "egg", "tofu", "corn", "tortilla", "broccoli", "zucchini", "spinach", "green bean", "brussels", "squash", "caesar", "salad", "plantain", "meatball", "sausage", "bacon", "turkey", "lamb", "chickpea", "lentil", "polenta", "grits", "biscuit", "cornbread", "collard", "slaw", "naan", "pita", "couscous", "orzo", "dumpling", "pancake", "fries"];

// Extra words the spell-checker knows, so ordinary words in a dish name
// ("homemade", "with", "garlic") aren't "corrected" into something else.
const PAIR_EXTRA_VOCAB = ["boat", "boats", "bowls", "bites", "tuscan", "marry", "street", "supreme", "hawaiian", "something", "loaded", "smothered", "stuffed", "zesty", "tangy", "savory", "hearty", "fancy", "light", "big", "small", "mini", "whole", "half", "dish", "meal", "and", "with", "the", "a", "of", "in", "on", "my", "mom's", "moms", "nani's", "grandma's", "homemade", "easy", "quick", "best", "classic", "simple", "healthy", "spicy", "creamy", "crispy", "cheesy", "baked", "fried", "pan", "seared", "pan-seared", "broiled", "braised", "roasted", "stuffed", "glazed", "honey", "garlic", "lemon", "herb", "butter", "cheese", "tomato", "sauce", "gravy", "white", "red", "green", "black", "sweet", "sour", "hot", "mild", "bbq", "night", "dinner", "lunch", "leftover", "leftovers", "style", "chops", "chop", "thighs", "breast", "wings", "tenders", "bites", "bowl", "plate", "pie", "cakes", "tacos", "skewers", "fillet", "filets", "steaks", "pot", "one", "sheet", "instant", "slow", "cooker", "air", "fryer", "grill", "oven", "stovetop", "family", "vegan", "vegetarian", "gluten", "free", "keto", "low", "carb", "protein", "chipotle", "buffalo", "ranch", "parmesan", "mozzarella", "ricotta", "cheddar", "feta", "coconut", "peanut", "ginger", "soy", "chili", "lime", "cilantro", "basil", "oregano", "rosemary", "thyme", "mustard", "maple", "brown", "sugar", "mushrooms", "onion", "onions", "apple", "cranberry", "orange", "bean", "shells", "rolls", "roll", "loaf", "casserole"];

// Everyday dishes offered in the search box alongside the family recipes.
const PAIR_COMMON_DISHES = [
  "Spaghetti and meatballs", "Lasagna", "Chicken parm", "Eggplant parm", "Baked ziti", "Pizza", "Penne alla vodka",
  "Gnocchi", "Fettuccine alfredo", "Carbonara", "Shrimp scampi", "Chicken marsala", "Chicken piccata", "Risotto",
  "Stuffed shells", "Tortellini", "Pesto pasta", "Bolognese", "Sausage and peppers", "Chicken cacciatore",
  "Steak", "Ribeye", "Burgers", "BBQ ribs", "Brisket", "Pulled pork", "Grilled chicken", "Hot dogs", "Chicken wings",
  "Roast chicken", "Rotisserie chicken", "Meatloaf", "Pork chops", "Pork tenderloin", "Pot roast", "Prime rib",
  "Mac and cheese", "Turkey", "Glazed ham", "Chicken pot pie", "Shepherd's pie", "Beef stroganoff", "Chicken tenders",
  "Tacos", "Fish tacos", "Burritos", "Burrito bowls", "Enchiladas", "Fajitas", "Quesadillas", "Nachos", "Carne asada",
  "Chicken stir fry", "Beef and broccoli", "Teriyaki salmon", "Fried rice", "Lo mein", "Orange chicken",
  "General Tso's chicken", "Dumplings", "Pad thai", "Thai green curry", "Bulgogi", "Bibimbap", "Chicken katsu",
  "Ramen", "Pho", "Sushi bowls", "Chicken adobo",
  "Chicken tikka masala", "Butter chicken", "Chicken curry", "Chana masala", "Dal",
  "Gyros", "Chicken souvlaki", "Chicken shawarma", "Falafel", "Lamb chops", "Paella",
  "Salmon", "Baked cod", "Crab cakes", "Fish and chips", "Seared scallops", "Lobster tails",
  "Fried chicken", "Shrimp and grits", "Jambalaya", "Gumbo", "Chicken and dumplings", "Seafood boil",
  "Tomato soup", "Beef chili", "Chicken noodle soup", "Beef stew", "French onion soup", "Minestrone", "Clam chowder",
  "Pancakes", "Waffles", "French toast", "Omelet", "Quiche", "Eggs benedict", "Breakfast burritos",
  "Grilled cheese", "BLT", "Philly cheesesteak", "Reuben", "Meatball sub", "Chicken salad sandwich",
  "Caesar salad", "Cobb salad", "Jerk chicken", "Rice and beans", "Pernil", "Arroz con pollo", "Ropa vieja",
  "Coq au vin", "Steak frites", "Beef bourguignon", "Beef Wellington"
];

const PAIR_SIDES = {
  italian: {
    veggie: [
      { name: "Garlicky sautéed broccoli rabe", why: "Its bitterness cuts through rich tomato sauce and cheese." },
      { name: "Roasted zucchini with parmesan", why: "Light and summery; soaks up any extra sauce.", seasonal: ["zucchini"] },
      { name: "Arugula salad with lemon & shaved parm", why: "A sharp, peppery reset between bites of something heavy.", seasonal: ["lemon"] },
      { name: "Caprese with fresh tomatoes & basil", why: "Peak-season tomatoes make it a side worth the plate space.", seasonal: ["tomato"] },
      { name: "Sautéed spinach with garlic & chili flake", why: "Five minutes in a pan; classic red-sauce-joint side." },
      { name: "Roasted green beans with almonds", why: "Crisp-tender crunch next to soft pasta or cutlets.", seasonal: ["green beans"] }
    ],
    carb: [
      { name: "Garlic bread", why: "Made for mopping up sauce." },
      { name: "Fresh homemade pasta with butter & parm", why: "If the main is a cutlet or meatballs, a small plate of pasta makes it a full Italian dinner.", recipeId: 16 },
      { name: "Creamy polenta", why: "Soft and cheesy under anything braised or saucy." },
      { name: "Rosemary roasted potatoes", why: "Crispy edges for when you want a carb that isn't pasta." },
      { name: "Focaccia", why: "Olive-oily bread that pairs with sauce or salad." }
    ],
    protein: [
      { name: "Italian sausage, roasted with peppers", why: "Sweet or hot sausage is the classic Sunday-sauce partner." },
      { name: "Meatballs", why: "Turn a pasta night into a red-sauce feast.", recipeId: 60 },
      { name: "Chicken cutlets (piccata or parm)", why: "Lean, quick, and built for lemon or tomato.", recipeId: 59 },
      { name: "Shrimp scampi", why: "Garlic, butter, and white wine go with almost any pasta." },
      { name: "Italian meatloaf", why: "A family favorite that stands in for meatballs on a busy night.", recipeId: 15 }
    ]
  },
  mexican: {
    veggie: [
      { name: "Elote-style corn (grilled, with lime & cotija)", why: "Sweet, smoky, and tangy next to spiced meat." },
      { name: "Homemade salsa & a crunchy slaw", why: "Bright acidity balances rich fillings.", seasonal: ["tomato"], recipeId: 29 },
      { name: "Fajita peppers & onions", why: "Charred and sweet; goes right into the tortilla too." },
      { name: "Avocado-tomato salad with lime", why: "Cool and creamy against the heat.", seasonal: ["tomato"] },
      { name: "Calabacitas (sautéed zucchini & corn)", why: "A traditional summer squash side that's light and fast.", seasonal: ["zucchini"] }
    ],
    carb: [
      { name: "Mexican rice (tomato-simmered)", why: "The classic plate-mate for tacos and enchiladas." },
      { name: "Cilantro-lime rice", why: "Fresh and fluffy; good if the main already brings a lot of spice." },
      { name: "Nani's rice & beans", why: "Hearty family version that covers carb and protein at once.", recipeId: 23 },
      { name: "Tortilla chips", why: "Easy crunch for salsa and guac." },
      { name: "Roasted sweet potatoes with chili & lime", why: "Sweet against smoky spice.", seasonal: ["sweet potato", "yams"] }
    ],
    protein: [
      { name: "Refried or black beans", why: "The standard protein side; creamy against crunchy tacos." },
      { name: "Grilled chicken (lime & chili)", why: "Lean and quick; fills out a quesadilla or soup night.", recipeId: 58 },
      { name: "Carne asada / steak", why: "Big, beefy flavor for a taco spread.", recipeId: 57 },
      { name: "Chorizo", why: "A little goes a long way; crumble it over beans or eggs." },
      { name: "Garlic-lime shrimp", why: "Fast, bright, and a nice change from beef or chicken." }
    ]
  },
  asian: {
    veggie: [
      { name: "Garlic stir-fried bok choy", why: "Crisp stems and silky greens in five minutes." },
      { name: "Smashed cucumber salad", why: "Cool and tangy next to anything saucy or fried." },
      { name: "Sesame green beans", why: "Blistered and nutty; holds up next to bold sauces.", seasonal: ["green beans"] },
      { name: "Steamed broccoli with ginger vinaigrette", why: "Clean and bright with the family dressing.", recipeId: 28 },
      { name: "Edamame with sea salt", why: "Zero-effort side that adds a little protein too." }
    ],
    carb: [
      { name: "Best fluffy white rice", why: "Plain rice lets a bold sauce be the star.", recipeId: 24 },
      { name: "Egg fried rice", why: "Turns leftover rice into a side that eats like a meal.", recipeId: 65 },
      { name: "Garlic sesame noodles", why: "Slurpable and simple next to a stir-fry or grilled protein." },
      { name: "Potstickers / dumplings", why: "Crispy-bottomed and fun to share." },
      { name: "Jasmine or coconut rice", why: "Fragrant and slightly sweet next to spicy dishes." }
    ],
    protein: [
      { name: "Teriyaki chicken thighs", why: "Sweet-salty glaze that every kid and adult likes." },
      { name: "Crispy tofu", why: "Takes on any sauce; great if the main is veggie-heavy." },
      { name: "Soy-ginger salmon", why: "Rich fish and a sharp glaze balance each other." },
      { name: "Pork & green bean stir-fry", why: "A family stir-fry that doubles as protein and veggie.", recipeId: 22, seasonal: ["green beans"] },
      { name: "Soft-boiled soy eggs", why: "A little bowl of these upgrades noodles or rice." }
    ]
  },
  indian: {
    veggie: [
      { name: "Cucumber raita", why: "Cool yogurt tames the heat of a curry." },
      { name: "Roasted cauliflower with cumin", why: "Nutty and toasty; stands up to strong spices." },
      { name: "Saag (spiced spinach)", why: "Silky greens that belong next to any curry." },
      { name: "Kachumber salad (tomato, cucumber, onion)", why: "Crunchy and sour; cuts rich sauce.", seasonal: ["tomato"] },
      { name: "Spiced roasted butternut squash", why: "Sweet squash and warm spices are a natural match.", seasonal: ["butternut squash"] }
    ],
    carb: [
      { name: "Basmati rice", why: "Long, separate grains for soaking up sauce." },
      { name: "Naan", why: "Warm, chewy, and made for scooping." },
      { name: "Jeera (cumin) rice", why: "Plain rice with a little toasted-spice perfume." },
      { name: "Spiced roasted potatoes (aloo)", why: "Crispy and turmeric-gold; a crowd favorite." }
    ],
    protein: [
      { name: "Tandoori chicken", why: "Yogurt-marinated and charred; great beside a veggie curry." },
      { name: "Dal (spiced lentils)", why: "Comforting and protein-rich; works with any curry." },
      { name: "Chana masala (chickpeas)", why: "Hearty vegetarian protein with plenty of sauce." },
      { name: "Paneer tikka", why: "Grilled cheese cubes that hold their shape and take spice well." }
    ]
  },
  mediterranean: {
    veggie: [
      { name: "Traditional Greek salad (horiatiki)", why: "Tomato, cucumber, feta, and olives; the classic partner.", seasonal: ["tomato"], recipeId: 69 },
      { name: "Roasted eggplant with tahini", why: "Smoky and creamy.", seasonal: ["eggplant"] },
      { name: "Lemony roasted zucchini", why: "Light and bright next to grilled meat.", seasonal: ["zucchini", "lemon"] },
      { name: "Tzatziki with cucumber & dill", why: "Cool dip that doubles as a sauce." },
      { name: "Charred green beans with garlic & lemon", why: "Simple and fresh.", seasonal: ["green beans", "lemon"] }
    ],
    carb: [
      { name: "Lemon rice pilaf", why: "Fluffy and citrusy; catches the juices.", seasonal: ["lemon"] },
      { name: "Warm pita", why: "For wrapping, dipping, and scooping." },
      { name: "Greek lemon potatoes", why: "Roasted in lemon and oregano until crisp at the edges.", seasonal: ["lemon"] },
      { name: "Orzo salad with feta & herbs", why: "Good warm or cold." },
      { name: "Couscous with herbs", why: "Five minutes and it soaks up everything." }
    ],
    protein: [
      { name: "Greek marinated chicken skewers", why: "The family marinade is made for this.", recipeId: 30 },
      { name: "Grilled lamb chops", why: "Rich and herby; the traditional choice." },
      { name: "Hummus & falafel", why: "Plant-based protein with a lot of flavor." },
      { name: "Grilled shrimp with oregano", why: "Quick and light for warm nights." }
    ]
  },
  bbq: {
    veggie: [
      { name: "Grilled corn on the cob", why: "Smoky-sweet and goes on the grill next to the main." },
      { name: "Creamy coleslaw", why: "Cool crunch next to smoky, saucy meat." },
      { name: "Grilled zucchini & peppers", why: "Same grill, same time.", seasonal: ["zucchini"] },
      { name: "Tomato & cucumber salad", why: "Fresh and acidic against rich meat.", seasonal: ["tomato"] },
      { name: "Roasted Brussels sprouts with bacon & cranberries", why: "A cold-weather side that still feels like a cookout.", seasonal: ["brussels sprouts", "cranberries"], recipeId: 52 },
      { name: "Wedge salad", why: "Steakhouse classic: crisp, cold, and blue-cheesy." }
    ],
    carb: [
      { name: "Potato salad", why: "The cookout standard." },
      { name: "Mac & cheese", why: "Creamy and rich; a BBQ-plate must.", recipeId: 20 },
      { name: "Cornbread", why: "Sweet crumb against salty, smoky meat." },
      { name: "Baked potato or steak fries", why: "Steakhouse move: let the steak stay the star." },
      { name: "Baked beans", why: "Sweet and smoky; covers a little protein too." },
      { name: "Soft pretzel rolls", why: "Homemade and great for sliders or dogs.", recipeId: 32 }
    ],
    protein: [
      { name: "Classic beef burgers", why: "Easy to grill alongside anything.", recipeId: 61 },
      { name: "Grilled chicken thighs", why: "Juicy and forgiving on the grill." },
      { name: "Steak with chimichurri", why: "The family chimichurri makes any steak better.", recipeId: 27 },
      { name: "BBQ pulled pork", why: "Great for a crowd and better the next day." },
      { name: "Grilled sausages or brats", why: "Low effort, everyone likes them." }
    ]
  },
  classic: {
    veggie: [
      { name: "Roasted Brussels sprouts", why: "Crispy, a little sweet; the family version has bacon and cranberries.", seasonal: ["brussels sprouts", "cranberries"], recipeId: 52 },
      { name: "Green beans almondine", why: "Buttery and crisp; works on any dinner plate.", seasonal: ["green beans"] },
      { name: "Honey-glazed carrots", why: "Sweet and soft next to roasts and chops." },
      { name: "Roasted butternut squash", why: "Caramelized and cozy for fall and winter.", seasonal: ["butternut squash"] },
      { name: "Steamed broccoli with lemon butter", why: "The weeknight standby.", seasonal: ["lemon"] },
      { name: "Simple garden salad", why: "Something fresh next to a heavier main." }
    ],
    carb: [
      { name: "Mashed potatoes", why: "The default for a reason; catches gravy." },
      { name: "Candied yams", why: "Sweet, buttery, and great next to roasts.", seasonal: ["yams", "sweet potato"], recipeId: 51 },
      { name: "Thanksgiving dressing", why: "Not just for November; great beside roast chicken or pork.", recipeId: 50 },
      { name: "Grandpa's soda bread", why: "Hearty and buttery next to roasts and stews.", recipeId: 31 },
      { name: "Mac & cheese", why: "Comfort next to comfort.", recipeId: 20 },
      { name: "Buttered egg noodles", why: "Quick and soft; good under anything saucy." }
    ],
    protein: [
      { name: "Roast chicken", why: "The all-purpose main that goes with every classic side." },
      { name: "Perfect roast turkey", why: "The family holiday bird.", recipeId: 48 },
      { name: "Pork chops with apples", why: "Sweet and savory, best in fall.", seasonal: ["apple"] },
      { name: "Meatloaf", why: "Old-school and filling.", recipeId: 15 },
      { name: "Glazed ham", why: "Feeds a crowd with little effort." }
    ]
  },
  southern: {
    veggie: [
      { name: "Braised collard greens", why: "Smoky, garlicky greens: the soul-food side next to anything fried or spicy." },
      { name: "Creamy coleslaw", why: "Cool crunch that tames fried chicken or Cajun heat." },
      { name: "Fried okra or roasted okra", why: "A true Southern vegetable; roasting keeps it crisp, not slimy." },
      { name: "Fried green tomatoes", why: "Tangy and crunchy.", seasonal: ["tomato"] },
      { name: "Southern green beans with bacon", why: "Slow-cooked and savory.", seasonal: ["green beans"] },
      { name: "Corn maque choux", why: "Cajun sautéed corn with peppers; sweet next to spice." }
    ],
    carb: [
      { name: "Buttermilk biscuits", why: "Flaky and buttery; made for fried chicken and gravy." },
      { name: "Skillet cornbread", why: "The classic Southern bread." },
      { name: "Mac & cheese", why: "A soul-food plate staple.", recipeId: 20 },
      { name: "Cheesy grits", why: "Creamy and rich under shrimp or blackened fish." },
      { name: "Candied yams", why: "Sweet against salty and spicy.", seasonal: ["yams", "sweet potato"], recipeId: 51 },
      { name: "Dirty rice or plain white rice", why: "Soaks up gumbo, étouffée, or red beans.", recipeId: 24 }
    ],
    protein: [
      { name: "Fried chicken", why: "The centerpiece of a Southern spread." },
      { name: "Blackened shrimp", why: "Cajun spice and quick to cook." },
      { name: "Andouille sausage", why: "Smoky Cajun sausage for rice dishes and boils." },
      { name: "Red beans", why: "Hearty, creamy, and classic New Orleans." },
      { name: "BBQ pulled pork", why: "A Southern standby for a crowd." }
    ]
  },
  seafood: {
    veggie: [
      { name: "Roasted asparagus with lemon", why: "Light and green; lets the fish shine.", seasonal: ["lemon"] },
      { name: "Sautéed spinach with garlic", why: "Quick and mild next to delicate fish." },
      { name: "Cherry tomato & herb salad", why: "Juicy and acidic against rich salmon.", seasonal: ["tomato"] },
      { name: "Lemony green beans", why: "Crisp and bright.", seasonal: ["green beans", "lemon"] },
      { name: "Roasted zucchini", why: "Soft, mild, and summery.", seasonal: ["zucchini"] }
    ],
    carb: [
      { name: "Lemon herb rice", why: "Soaks up butter sauces and pan juices.", seasonal: ["lemon"] },
      { name: "Roasted baby potatoes", why: "Crispy outside, creamy inside." },
      { name: "Crusty bread", why: "For dipping into garlic butter or broth." },
      { name: "Orzo with herbs", why: "Light pasta that doesn't overpower fish." },
      { name: "Couscous", why: "Fast and fluffy." }
    ],
    protein: [
      { name: "Garlic butter shrimp", why: "Pairs with almost any fish for a surf-and-surf plate." },
      { name: "Seared scallops", why: "Fancy and quick." },
      { name: "Grilled chicken with lemon", why: "A familiar backup for anyone who skips fish." },
      { name: "White bean salad", why: "Plant protein that goes with Mediterranean-style fish." }
    ]
  },
  french: {
    veggie: [
      { name: "Haricots verts with shallots", why: "Thin green beans in butter: the bistro default.", seasonal: ["green beans"] },
      { name: "Ratatouille", why: "Provençal stewed summer vegetables.", seasonal: ["zucchini", "eggplant", "tomato"] },
      { name: "Frisée or butter-lettuce salad with Dijon vinaigrette", why: "Sharp dressing cuts rich sauces." },
      { name: "Glazed carrots", why: "Sweet and buttery." }
    ],
    carb: [
      { name: "Potatoes gratin", why: "Creamy and golden; pure comfort." },
      { name: "Croissants or a baguette", why: "For mopping up a wine sauce.", recipeId: 33 },
      { name: "Pommes purée (very buttery mashed potatoes)", why: "Silky base for braises." },
      { name: "Frites", why: "Bistro classic with steak." }
    ],
    protein: [
      { name: "Steak au poivre", why: "Peppercorn cream sauce, a bistro staple." },
      { name: "Roast chicken with herbs", why: "Simple and French at heart." },
      { name: "Pan-seared duck breast", why: "Rich and special-occasion." },
      { name: "Moules (mussels) in white wine", why: "Light and fun to share." }
    ]
  },
  caribbean: {
    veggie: [
      { name: "Sweet fried plantains", why: "Caramelized and sweet against savory or spicy food." },
      { name: "Mango-cabbage slaw", why: "Crunchy and tropical; cools jerk spice." },
      { name: "Sautéed callaloo or collard greens", why: "Garlicky greens, island-style." },
      { name: "Avocado & tomato salad", why: "Creamy and fresh.", seasonal: ["tomato"] }
    ],
    carb: [
      { name: "Nani's rice & beans", why: "The family's own; the classic partner.", recipeId: 23 },
      { name: "Coconut rice", why: "Fragrant and a little sweet." },
      { name: "Tostones (twice-fried green plantains)", why: "Crispy and salty, great with mojo." },
      { name: "Yuca with garlic mojo", why: "Starchy, garlicky, and very Cuban.", seasonal: ["citrus"] }
    ],
    protein: [
      { name: "Jerk chicken", why: "Spicy, smoky, and the island classic." },
      { name: "Steak with chimichurri", why: "Herby Latin sauce made for grilled beef.", recipeId: 27 },
      { name: "Mojo pork", why: "Citrus-garlic roast pork.", seasonal: ["citrus", "orange"] },
      { name: "Black beans", why: "Simple and filling." }
    ]
  },
  soup: {
    veggie: [
      { name: "Simple green salad with vinaigrette", why: "Crisp and fresh beside something warm and soft." },
      { name: "Roasted broccoli", why: "Crunchy edges add texture next to a smooth soup." },
      { name: "Roasted Brussels sprouts", why: "Hearty enough for a winter soup night.", seasonal: ["brussels sprouts"], recipeId: 52 },
      { name: "Caesar salad", why: "Classic soup-and-salad combo." }
    ],
    carb: [
      { name: "Classic grilled cheese", why: "The soup partner, especially for tomato.", recipeId: 53 },
      { name: "Grandpa's soda bread", why: "Dense and buttery; holds up to dunking.", recipeId: 31 },
      { name: "Cornbread", why: "The chili classic." },
      { name: "Crusty bread & butter", why: "Easy and always right." },
      { name: "Oyster crackers or croutons", why: "Crunch right on top." }
    ],
    protein: [
      { name: "Chicken Caesar salad", why: "Turns soup night into a full dinner.", recipeId: 62 },
      { name: "Chicken quesadillas", why: "Great beside a Mexican chicken soup or chili.", recipeId: 56 },
      { name: "BLT sandwiches (half each)", why: "Bacon and tomato love a cup of soup.", recipeId: 67 },
      { name: "Hard-boiled eggs or a ham sandwich", why: "Simple protein for a light soup." }
    ]
  },
  breakfast: {
    veggie: [
      { name: "Fresh fruit salad", why: "The bright side for sweet or savory brunch.", seasonal: ["strawberries", "blueberries", "raspberries"] },
      { name: "Sautéed spinach & mushrooms", why: "Savory and quick next to eggs." },
      { name: "Roasted breakfast tomatoes", why: "Juicy and a little jammy.", seasonal: ["tomato"] },
      { name: "Avocado slices with lemon & salt", why: "Creamy and filling.", seasonal: ["lemon"] }
    ],
    carb: [
      { name: "Crispy home fries", why: "Savory counterpoint to eggs." },
      { name: "Toast with chia seed jam", why: "The family's quick, healthier jam.", recipeId: 5 },
      { name: "Raspberry cream scones", why: "Sweet bakery treat for a slow morning.", seasonal: ["raspberries"], recipeId: 3 },
      { name: "Blueberry muffins", why: "Make-ahead and good all week.", seasonal: ["blueberries"], recipeId: 6 },
      { name: "Fluffy pancakes", why: "If the main is savory, a short stack makes it brunch.", recipeId: 66 }
    ],
    protein: [
      { name: "Bacon", why: "Salty and crisp next to anything sweet." },
      { name: "Scrambled eggs", why: "Simple protein for a pancake or French toast morning." },
      { name: "Breakfast sausage", why: "Savory and hearty." },
      { name: "Greek yogurt with Nani's granola", why: "A lighter protein that still feels like a treat.", recipeId: 4 }
    ]
  },
  sandwich: {
    veggie: [
      { name: "Pickles & crunchy veg sticks", why: "Cold crunch next to a warm sandwich." },
      { name: "Side salad", why: "Something fresh beside bread and cheese." },
      { name: "Tomato & cucumber salad", why: "Juicy and bright.", seasonal: ["tomato"] },
      { name: "Coleslaw", why: "Deli classic." }
    ],
    carb: [
      { name: "Classic tomato soup", why: "The grilled-cheese partner.", recipeId: 54, seasonal: ["tomato"] },
      { name: "Kettle chips", why: "Salty crunch, no effort." },
      { name: "Oven fries", why: "Diner-style, without the fryer." },
      { name: "Pasta salad", why: "Make-ahead and picnic-friendly." }
    ],
    protein: [
      { name: "Cup of chili", why: "Hearty and great for dunking.", recipeId: 63 },
      { name: "Hard-boiled eggs", why: "Make-ahead protein for a light lunch." },
      { name: "Turkey or ham slices", why: "Turn a cheese sandwich into a full one." },
      { name: "Chicken Caesar salad", why: "Half-sandwich, half-salad lunch.", recipeId: 62 }
    ]
  },
  salad: {
    veggie: [
      { name: "Roasted vegetables", why: "Warm and caramelized next to cool greens." },
      { name: "Cup of tomato soup", why: "Classic soup-and-salad.", recipeId: 54, seasonal: ["tomato"] },
      { name: "Butternut squash & apple soup", why: "Sweet and warming next to crisp greens.", seasonal: ["butternut squash", "apple"], recipeId: 11 }
    ],
    carb: [
      { name: "Garlic bread or croutons", why: "Crunch and something to fill you up." },
      { name: "Grandpa's soda bread", why: "Hearty bread beside a light salad.", recipeId: 31 },
      { name: "Warm pita", why: "Great with Greek or Mediterranean salads." },
      { name: "Roasted sweet potatoes", why: "Turns a salad into a meal.", seasonal: ["sweet potato", "yams"] }
    ],
    protein: [
      { name: "Grilled chicken", why: "The easiest way to make a salad dinner." },
      { name: "Seared salmon", why: "Rich fish on cool greens." },
      { name: "Hard-boiled eggs", why: "Cheap, quick, filling." },
      { name: "Chickpeas (roasted crispy)", why: "Crunchy plant protein." },
      { name: "Steak strips", why: "Steakhouse-salad style." }
    ]
  }
};
