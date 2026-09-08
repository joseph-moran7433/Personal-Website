// ─────────────────────────────────────────────────────────────────
// RECIPE FINDER DATA
// Transcribed and lightly cleaned up from three family recipe
// documents (scanned handwritten cards + printed pages), so a few
// items carry notes about gaps in the original source.
//
// Tag vocabulary:
//   mood:     "comfort" | "healthy" | "fancy"        (a recipe can have more than one)
//   cuisine:  "italian" | "mexican" | "asian" | "greek" | "irish" | "french" | "american" | "caribbean"
//   mealType: "breakfast" | "dinner" | "dessert"     (a recipe can have more than one, e.g. soda bread)
//   category is just a label for the card (breakfast/soup/main/side/bread/dessert/cake/sauce)
//   seasonal: lowercase produce keywords checked against SEASONAL_PRODUCE for the current month
//
// Sauces/marinades (category "sauce") aren't a meal on their own — they
// carry a `pairsWith` string suggesting what to serve them with (a pasta,
// a grilled steak, etc.), shown instead of pretending the sauce is dinner.
//
// Ingredient/instruction strings starting with "▸ " render as a
// sub-heading (e.g. "▸ Dough", "▸ Filling") instead of a bullet/step.
// ─────────────────────────────────────────────────────────────────

const SEASONAL_PRODUCE = {
  1:  ["citrus","orange","lemon","butternut squash","brussels sprouts","cranberries"],
  2:  ["citrus","orange","lemon","butternut squash","brussels sprouts"],
  3:  ["peas","citrus","lemon"],
  4:  ["peas","zucchini"],
  5:  ["peas","zucchini","strawberries"],
  6:  ["zucchini","blueberries","raspberries","peas","green beans"],
  7:  ["zucchini","tomato","blueberries","raspberries","green beans","eggplant"],
  8:  ["tomato","zucchini","eggplant","green beans"],
  9:  ["tomato","apple","zucchini","eggplant","green beans"],
  10: ["apple","pumpkin","butternut squash","brussels sprouts","cranberries","yams","sweet potato"],
  11: ["apple","pumpkin","butternut squash","brussels sprouts","cranberries","yams","sweet potato"],
  12: ["citrus","orange","lemon","cranberries","brussels sprouts","butternut squash"]
};

const MEAL_OPTIONS = [
  { value: "breakfast", label: "Breakfast" },
  { value: "dinner", label: "Dinner" },
  { value: "dessert", label: "Dessert" }
];

const MOOD_OPTIONS = [
  { value: "comfort", label: "Comfort Food" },
  { value: "healthy", label: "Healthy" },
  { value: "fancy", label: "Fancy" }
];

const CUISINE_OPTIONS = [
  { value: "italian", label: "Italian" },
  { value: "mexican", label: "Mexican" },
  { value: "asian", label: "Asian" },
  { value: "greek", label: "Greek & Mediterranean" },
  { value: "irish", label: "Irish" },
  { value: "french", label: "French" },
  { value: "american", label: "American / Classic" },
  { value: "caribbean", label: "Caribbean & Latin" }
];

const CATEGORY_EMOJI = {
  breakfast: "🍳", soup: "🍲", main: "🍽️", side: "🥗",
  bread: "🍞", dessert: "🍪", cake: "🎂", sauce: "🧂"
};

const recipes = [

// ── BREAKFAST & BRUNCH ──────────────────────────────────────────
{
  id: 0, title: "Baked French Toast", category: "breakfast",
  mealType: ["breakfast"],
  cuisine: ["american"], mood: ["comfort"], seasonal: [],
  time: "1 hr 15 min", serves: "12",
  ingredients: [
    "▸ French Toast",
    "1 loaf crusty sourdough or French bread",
    "8 whole eggs",
    "2 cups whole milk",
    "1/2 cup heavy cream",
    "3/4 cup sugar",
    "2 tablespoons vanilla extract",
    "▸ Topping",
    "1/2 cup all-purpose flour",
    "1/2 cup firmly packed brown sugar",
    "1 teaspoon cinnamon",
    "1/4 teaspoon salt",
    "1 pinch nutmeg",
    "1 stick cold butter, cut into pieces",
    "Fresh fruit (optional)"
  ],
  instructions: [
    "Grease a 9x13-inch baking pan with butter. Tear bread into chunks (or cut into cubes) and distribute evenly in the pan.",
    "In a medium bowl, mix eggs, milk, cream, sugar, and vanilla. Pour evenly over the bread. Cover tightly and refrigerate several hours or overnight.",
    "In a separate bowl, mix flour, brown sugar, cinnamon, salt, and nutmeg. Cut in the butter pieces until the mixture resembles coarse pebbles. Store in a Ziploc in the fridge.",
    "When ready to bake, preheat oven to 350°F. Remove the casserole from the fridge; if using fruit, sprinkle it on first, then the crumble mixture on top.",
    "Bake 45 minutes for a softer, bread-pudding texture, or 1 hour or more for a firmer, less liquid texture."
  ]
},
{
  id: 1, title: "Extra Fluffy Cinnamon Rolls with Cream Cheese Frosting", category: "breakfast",
  mealType: ["breakfast"],
  cuisine: ["american"], mood: ["comfort","fancy"], seasonal: [],
  time: "3.5 hrs", serves: "8-12",
  ingredients: [
    "▸ Dough",
    "2 1/4 cups whole milk, divided",
    "5 3/4 cups (719g) all-purpose flour, divided",
    "1 large egg",
    "1 (1/4-oz) envelope instant yeast (about 2 1/4 tsp)",
    "1/2 cup (67g) granulated sugar",
    "1 tablespoon Diamond Crystal (or 1 3/4 tsp Morton) kosher salt",
    "1/2 cup (1 stick) unsalted butter, room temperature, cut into pieces",
    "▸ Filling",
    "1/2 cup (1 stick) unsalted butter",
    "1 cup packed (200g) dark brown sugar",
    "2 tablespoons ground cinnamon",
    "2 tablespoons heavy cream",
    "1/2 teaspoon Diamond Crystal (or 1/4 tsp Morton) kosher salt",
    "▸ Frosting & Assembly",
    "4 tablespoons unsalted butter, room temperature, plus more for pans",
    "All-purpose flour, for the surface",
    "8 oz cream cheese, room temperature",
    "1 1/4 cups (138g or more) powdered sugar",
    "1 tablespoon (or more) heavy cream",
    "1 teaspoon lemon zest (optional)",
    "1/4 teaspoon Diamond Crystal (or Morton) kosher salt"
  ],
  instructions: [
    "▸ Dough",
    "Whisk 3/4 cup milk and 1/4 cup flour in a saucepan over medium heat until thickened and whisk lines show on the pan bottom, about 2 minutes. Scrape this tangzhong into a stand mixer bowl and let cool.",
    "Add the egg, yeast, sugar, salt, and remaining 1 1/2 cups milk; whisk to combine. Add the remaining 5 1/2 cups flour. Mix on low with the dough hook until combined, then medium-low until smooth and elastic, 18-24 minutes — the dough is ready when a golf-ball piece stretches thin enough to see light through.",
    "Add the butter and mix until incorporated and the dough pulls cleanly from the bowl, 5-7 more minutes. Cover with a damp towel and let rise in a warm spot until doubled, 60-90 minutes.",
    "▸ Filling",
    "While the dough rises, cook the butter in a small saucepan until it foams and the milk solids turn dark amber, about 4 minutes. Cool slightly, then mix in the brown sugar, cinnamon, cream, and salt.",
    "▸ Assembly",
    "Butter two 9-inch cake pans. Roll the punched-down dough into a 24x13-inch rectangle (short side facing you); let rest 5-10 minutes first if it feels stiff. Spread the filling evenly over the dough.",
    "Roll tightly into a log, seam side down. Trim the ends, then cut into 12 equal rounds (dental floss works well). Nestle 6 rounds cut-side down in each pan. Cover and let rise until doubled, 30-50 minutes.",
    "Preheat oven to 350°F. Bake 25-30 minutes until golden and puffed (don't worry if they rise dramatically in the center).",
    "Meanwhile, beat the butter and cream cheese until smooth. Add powdered sugar, cream, lemon zest, and salt; beat until smooth and spreadable, thinning with more cream if needed.",
    "Let the rolls cool in the pan 5 minutes, then spread with frosting."
  ]
},
{
  id: 2, title: "Sweet Cinnamon Scones", category: "breakfast",
  mealType: ["breakfast"],
  cuisine: ["american"], mood: ["comfort"], seasonal: [],
  time: "45 min", serves: "16",
  ingredients: [
    "6 cups all-purpose flour",
    "2/3 cup sugar",
    "10 teaspoons baking powder",
    "1 teaspoon ground cinnamon",
    "4 sticks unsalted butter",
    "1 1/2 cups heavy cream",
    "2 whole eggs",
    "2 teaspoons vanilla extract",
    "2 cups cinnamon chips",
    "▸ Topping",
    "1 cup sugar",
    "2 teaspoons ground cinnamon",
    "3 teaspoons heavy cream"
  ],
  instructions: [
    "Preheat oven to 350°F.",
    "In a large bowl, mix flour, sugar, cinnamon, and baking powder. Cut the butter into pieces and cut into the dry ingredients with a pastry cutter until it resembles coarse crumbs. Stir in cinnamon chips.",
    "Mix the cream, egg, and vanilla; pour into the flour mixture and stir gently with a fork to combine.",
    "Turn onto a work surface (it will be crumbly) and gently press together as you flatten into a large circle or rectangle. Mix the topping ingredients and sprinkle over the top, pressing lightly.",
    "Cut into wedges or triangles, transfer to a cookie sheet, and bake 20-25 minutes. Cool completely; serve with coffee."
  ]
},
{
  id: 3, title: "Raspberry Cream Scones", category: "breakfast",
  mealType: ["breakfast"],
  cuisine: ["american"], mood: ["comfort","fancy"], seasonal: ["raspberries"],
  time: "30 min", serves: "8",
  source: "Adapted from America's Test Kitchen",
  ingredients: [
    "2 cups flour",
    "1 tablespoon baking powder",
    "3 tablespoons sugar",
    "1/2 teaspoon salt",
    "5 tablespoons cold butter, cut into 1/4-inch cubes",
    "1/2 cup fresh raspberries",
    "1 cup heavy cream"
  ],
  instructions: [
    "Preheat oven to 425°F.",
    "Whisk flour, baking powder, sugar, and salt together. Cut in the butter with a pastry blender until it looks like coarse cornmeal with a few larger lumps. Gently stir in the raspberries.",
    "Add the cream and stir with a fork until the dough begins to form. Turn onto the counter and knead very briefly (5-10 seconds) into a slightly sticky mound.",
    "Pat into a rectangle about 1 inch tall and cut into 8-12 rounds with a biscuit cutter. Place on a parchment-lined sheet; brush with cream and sprinkle with sugar if desired.",
    "Bake 11-14 minutes until light brown. Cool on a rack 10 minutes before serving; best the day they're made, but freeze well."
  ],
  note: "Frozen raspberries work too — just add a few extra minutes of bake time."
},
{
  id: 4, title: "Nani's Granola", category: "breakfast",
  mealType: ["breakfast"],
  cuisine: ["american"], mood: ["healthy"], seasonal: [],
  time: "25 min",
  ingredients: [
    "2 cups quick oats",
    "1/2 cup brown sugar",
    "1/2 cup canola oil",
    "1/4 cup honey",
    "Sliced almonds, to taste",
    "Dry fruit, to taste"
  ],
  instructions: [
    "Mix all ingredients except the dried fruit together and spread on a cookie sheet.",
    "Bake at 350°F about 20 minutes, or until brown.",
    "Cool, then stir in the dried fruit of choice."
  ]
},
{
  id: 5, title: "Chia Seed Jam", category: "breakfast",
  mealType: ["breakfast"],
  cuisine: ["american"], mood: ["healthy"], seasonal: ["blueberries","raspberries","strawberries"],
  time: "20 min",
  ingredients: [
    "1 pound fresh fruit (berries)",
    "2 tablespoons maple syrup",
    "2 tablespoons chia seeds",
    "1 teaspoon lemon juice"
  ],
  instructions: [
    "In a pot over medium heat, add the fruit, maple syrup, and lemon juice. Simmer, mashing the fruit as it cooks, until it reaches your desired thickness.",
    "Turn off the heat and mix in the chia seeds. Transfer to a container to cool and set."
  ]
},
{
  id: 6, title: "Basic Muffin Recipe", category: "breakfast",
  mealType: ["breakfast"],
  cuisine: ["american"], mood: ["comfort"], seasonal: ["blueberries","cranberries","orange"],
  time: "35 min", serves: "12",
  ingredients: [
    "2 cups (260g) all-purpose flour",
    "1/2 cup (100g) granulated sugar",
    "2 teaspoons baking powder",
    "1/2 teaspoon salt",
    "3/4 cup (180ml) milk, room temperature",
    "1/2 cup (114g) unsalted butter, melted and cooled",
    "2 large eggs, room temperature"
  ],
  instructions: [
    "Preheat oven to 350°F. Line a muffin pan with paper liners.",
    "Whisk the flour, sugar, baking powder, and salt in one bowl. Whisk the milk, butter, and eggs in another until combined.",
    "Add the flour mixture to the wet ingredients and stir just until combined.",
    "Bake 20-25 minutes, until a toothpick comes out with only a few moist crumbs."
  ],
  note: "Blueberry variation: add 1 tsp vanilla and 3/4-1 cup fresh blueberries (raspberries or diced strawberries also work). Cranberry Orange variation: replace 1/4 cup of the milk with orange juice, add 1 tbsp orange zest, and fold in 3/4-1 cup fresh cranberries."
},
{
  id: 7, title: "Baked Oatmeal", category: "breakfast",
  mealType: ["breakfast"],
  cuisine: ["american"], mood: ["comfort","healthy"], seasonal: ["blueberries"],
  time: "55 min",
  ingredients: [
    "3 cups quick-cooking oats",
    "1 cup brown sugar",
    "2 teaspoons baking powder",
    "1 teaspoon salt",
    "1 teaspoon ground cinnamon",
    "2 large eggs",
    "1 cup milk",
    "About 1/4 cup butter, melted (optional)",
    "About 1 cup fresh blueberries"
  ],
  instructions: [
    "Preheat oven to 350°F.",
    "In a large bowl, combine oats, brown sugar, baking powder, salt, and cinnamon.",
    "Whisk the eggs, milk, and butter together, then stir into the oat mixture until blended. Fold in the blueberries.",
    "Pour into a greased 9x13-inch pan and bake about 40 minutes."
  ]
},
{
  id: 8, title: "Gluten Free Scones", category: "breakfast",
  mealType: ["breakfast"],
  cuisine: ["american"], mood: ["healthy"], seasonal: ["blueberries"],
  time: "45 min", serves: "12",
  ingredients: [
    "2/3 cup (110g) white rice flour",
    "2/3 cup (75g) blanched almond flour",
    "2/3 cup (69g) oat flour (GF if needed)",
    "3 tablespoons (22g) tapioca flour",
    "1/4 cup (50g) sugar",
    "2 1/2 teaspoons (7g) baking powder",
    "1/2 teaspoon fine sea salt",
    "6 tablespoons (85g) cold unsalted butter",
    "6 tablespoons (90ml) heavy cream",
    "1 large egg",
    "1 teaspoon vanilla extract (GF if needed)",
    "1 1/4 cups blueberries or other mix-ins"
  ],
  instructions: [
    "Whisk the dry ingredients (flours, sugar, salt, baking powder) together in a large bowl. Slice the butter into the bowl and cut it in with your fingers or a pastry cutter. Add fresh/dry fruit if using. Chill the flour mixture while you whisk the cream, egg, and vanilla in a separate pitcher.",
    "Remove the flour mixture from the fridge and stir in frozen fruit, if using. Gradually add the wet ingredients with a spatula.",
    "Shape the dough into a disk about 1 1/4 inches high (6-8 inches across) on plastic wrap. Wrap and chill 30 minutes, up to overnight.",
    "Preheat oven to 425°F. Cut the chilled dough into 12 scones on a lightly floured surface. Brush with cream and/or sugar if desired.",
    "Bake 20-25 minutes, rotating the pan halfway through."
  ]
},
{
  id: 9, title: "Classic English Scones", category: "breakfast",
  mealType: ["breakfast"],
  cuisine: ["irish"], mood: ["comfort"], seasonal: [],
  time: "45 min", serves: "12",
  ingredients: [
    "500g strong white bread flour, plus extra to dust",
    "25g baking powder",
    "80g unsalted butter, cut into pieces",
    "2 medium eggs",
    "250ml milk",
    "80g caster sugar"
  ],
  instructions: [
    "Mix the flour and baking powder. Rub in the butter with your fingers until it looks like breadcrumbs.",
    "In a separate bowl, beat the eggs, milk, and sugar. Add to the rubbed-in mixture and stir together until a ball forms.",
    "Tip the dough onto a floured board and fold over a couple of times — do not knead. Roll out to about 3cm thickness.",
    "Brush the tops with beaten egg and chill 20 minutes, then brush again.",
    "Bake 15 minutes at 425°F, until golden."
  ]
},
{
  id: 10, title: "Homemade Granola Bars", category: "breakfast",
  mealType: ["breakfast"],
  cuisine: ["american"], mood: ["healthy"], seasonal: [],
  time: "30 min", serves: "18-20 bars",
  source: "Recipe by Jami Boys, An Oregon Cottage",
  ingredients: [
    "3/4 cup butter",
    "1 cup honey",
    "1 teaspoon vanilla",
    "4 1/2 cups rolled oats",
    "1 cup whole wheat or spelt flour (or all-purpose, or gluten-free 1:1 flour)",
    "1/4 cup flax seed meal, optional (if not using, add 1/4 cup more flour)",
    "1 teaspoon baking soda",
    "1 cup total add-ins — a few favorites: 1/3 cup chocolate chips + 1/2 cup sunflower seeds; 1/2 cup dried cranberries + 1/2 cup chopped almonds; 1/2 cup raisins + 1/2 cup chopped peanuts"
  ],
  instructions: [
    "Line a 13x9-inch pan with parchment and preheat the oven to 325°F.",
    "Cream the butter, honey, and vanilla together in a large bowl. Add the oats, flour, flax meal, and baking soda; mix until combined. Stir in your add-ins.",
    "Press the mixture firmly and evenly into the pan (a wet hand or the bottom of a greased glass helps).",
    "Bake 18-20 minutes, until the edges just brown. Cool on a rack 10 minutes, then score into bars before letting cool completely in the pan.",
    "Store in airtight containers in the fridge (or freeze up to 6 months)."
  ],
  note: "Honey holds the bars together better than maple syrup — an all-honey or half-honey mix is recommended."
},

// ── SOUPS ────────────────────────────────────────────────────────
{
  id: 11, title: "Butternut Squash and Apple Soup", category: "soup",
  mealType: ["dinner"],
  cuisine: ["american"], mood: ["comfort","healthy"], seasonal: ["apple","butternut squash"],
  time: "1 hr", serves: "3.5 quarts",
  ingredients: [
    "2 tablespoons unsalted butter",
    "2 tablespoons good olive oil",
    "4 cups chopped yellow onions (3 large)",
    "2 tablespoons mild curry powder",
    "5 pounds butternut squash (2 large)",
    "1 1/2 pounds sweet apples, such as McIntosh (4 apples)",
    "2 teaspoons kosher salt",
    "1/2 teaspoon freshly ground black pepper",
    "2 cups water",
    "2 cups good apple cider or juice"
  ],
  instructions: [
    "Warm the butter, olive oil, onions, and curry powder in a large stockpot, uncovered, over low heat 15-20 minutes until the onions are tender, stirring occasionally.",
    "Peel the squash, halve, and remove the seeds; cut into chunks. Peel, core, and chunk the apples.",
    "Add the squash, apples, salt, pepper, and water to the pot. Bring to a boil, cover, and cook over low heat 30-40 minutes until very soft.",
    "Puree the soup through a food mill or in a food processor.",
    "Return to the pot, add the apple cider and enough water to reach your desired consistency. It should be slightly sweet and quite thick. Check seasoning and serve hot."
  ]
},
{
  id: 12, title: "Copycat Panera Squash Soup", category: "soup",
  mealType: ["dinner"],
  cuisine: ["american"], mood: ["comfort"], seasonal: ["butternut squash"],
  time: "30 min",
  ingredients: [
    "1 tablespoon extra virgin olive oil",
    "1 small yellow onion, diced (about 3/4 cup)",
    "2 pounds chopped butternut squash (about 6 heaping cups)",
    "3 small carrots, chopped (about 1 cup)",
    "3-4 cups vegetable broth",
    "2 cups apple cider or apple juice (not apple cider vinegar)",
    "1/2 teaspoon curry powder",
    "1/4 teaspoon cinnamon",
    "Dash of nutmeg",
    "1/2 cup pumpkin puree",
    "2 tablespoons butter",
    "2 ounces low-fat (neufchâtel) cream cheese",
    "1 tablespoon brown sugar, more to taste",
    "Salt to taste",
    "Heavy cream, optional"
  ],
  instructions: [
    "Heat the oil in a large pot over medium-high heat. Add the onion and sauté until translucent.",
    "Add the squash, carrots, vegetable broth, apple cider, and spices. Bring to a boil, reduce heat, and simmer 10-15 minutes until the squash and carrots are soft.",
    "Remove from heat and add the pumpkin puree, butter, cream cheese, and brown sugar. Puree with an immersion blender (or in batches in a regular blender) until very smooth.",
    "Taste and adjust salt, brown sugar, or honey as desired. Add heavy cream for a more decadent soup, or more broth to thin it.",
    "Return to the burner over medium-low to reheat if needed, then serve immediately."
  ],
  note: "Two cups of apple cider — not apple cider vinegar! If cider isn't available, use 100% apple juice."
},
{
  id: 13, title: "Mexican Chicken Soup", category: "soup",
  mealType: ["dinner"],
  cuisine: ["mexican"], mood: ["comfort","healthy"], seasonal: [],
  time: "1 hr 30 min", serves: "6-8",
  source: "By Ina Garten, Barefoot Contessa",
  ingredients: [
    "4 split (2 whole) chicken breasts, bone in, skin on",
    "Good olive oil",
    "Kosher salt and freshly ground black pepper",
    "2 cups chopped onions (2 onions)",
    "1 cup chopped celery (2 stalks)",
    "2 cups chopped carrots (4 carrots)",
    "4 large cloves garlic, chopped",
    "2 1/2 quarts chicken stock, preferably homemade",
    "1 (28-ounce) can whole tomatoes in puree, crushed",
    "2-4 jalapeño peppers, seeded and minced",
    "1 teaspoon ground cumin",
    "1 teaspoon ground coriander seed",
    "1/4-1/2 cup chopped fresh cilantro (optional)",
    "6 (6-inch) fresh white corn tortillas",
    "For serving: sliced avocado, sour cream, grated cheddar, tortilla chips"
  ],
  instructions: [
    "Preheat oven to 350°F. Place the chicken breasts skin side up on a sheet pan, rub with olive oil, season with salt and pepper, and roast 35-40 minutes until done. When cool enough to handle, discard the skin and bones and shred the meat.",
    "Meanwhile, heat 3 tablespoons olive oil in a large pot. Add the onions, celery, and carrots and cook over medium-low heat 10 minutes, until the onions start to brown. Add the garlic and cook 30 seconds.",
    "Add the chicken stock, tomatoes with their puree, jalapeños, cumin, coriander, 1 tablespoon salt, 1 teaspoon pepper, and cilantro if using. Cut the tortillas in half, then into 1/2-inch strips, and add to the soup.",
    "Bring to a boil, lower the heat, and simmer 25 minutes. Add the shredded chicken and season to taste.",
    "Serve hot, topped with sliced avocado, sour cream, grated cheddar, and broken tortilla chips."
  ]
},

// ── MAINS ────────────────────────────────────────────────────────
{
  id: 14, title: "My Sunday Sauce", category: "main",
  mealType: ["dinner"],
  cuisine: ["italian"], mood: ["comfort"], seasonal: ["tomato"],
  time: "3 hrs+",
  story: "Every late summer, our family gathers for one of our favorite traditions: picking bushels of San Marzano tomatoes to process, jar, and pressure cook for the year ahead. Everyone has a job. Dad and Poppy clean the tomatoes, Emily and I run the processor, and Nani and Mom do the jarring and pressure cooking. Somewhere along the way, Emily started a tradition of her own — hunting through the bushels for her \"special tomato,\" one that's a little funky or oddly shaped. Now tomato day isn't complete until someone hears her shout that she's found it.\n\nEaster in our family means a full Italian dinner — manicotti, this Sunday Sauce, and meatballs, the whole spread. For years it was Nani, Poppy, Mom, Dad, Emily, and me around the table, and for the last several years we were lucky enough to have Sister Terry and Peggy join us too. Sister Terry passed away last year, and her seat at that table is missed — but the sauce simmering all afternoon, and the whole family together in the kitchen, is still exactly what Easter feels like to us.",
  ingredients: [
    "1 piece salt pork, 1\" x 3\"",
    "4 or 5 meaty pork neck bones",
    "Sweet & hot Italian sausages",
    "1 lb ground round",
    "2 large cans plum tomatoes",
    "1 (16 oz) can tomato paste",
    "1/2 cup onion & 3 cloves garlic, blended with 1/4 cup water",
    "1/2 cup dry red wine",
    "1/2 cup grated Romano cheese",
    "1 tablespoon vinegar",
    "1 teaspoon sugar",
    "1 level teaspoon salt",
    "Fresh cracked black pepper",
    "1 teaspoon dried (or 1 tbsp fresh minced) parsley",
    "1 teaspoon dried (or 1 tbsp fresh minced) basil",
    "1/2 teaspoon fennel seed, crushed",
    "About 1 tablespoon olive oil"
  ],
  instructions: [
    "Render the salt pork in a heavy frying pan. In a separate heavy 6-quart sauce pan, brown the pork bones and sausage in 1 tablespoon olive oil.",
    "Add the ground beef to the sauce pan and break it up well. Once the red color is gone, add the tomatoes (pulsed briefly in a blender) and 1 cup water, plus all the herbs and seasonings except the onion and garlic. Bring to a boil, then lower to a simmer.",
    "Add the browned pork bones, salt pork, and sausage to the sauce pan; drain all but 1 tablespoon of fat from the frying pan. Add the onion and garlic to the frying pan and sauté briefly, then add the wine, vinegar, and tomato paste; mix well.",
    "Add this to the sauce pan; rinse the frying pan with 1/2 cup water and add that too. Simmer 2 hours, stirring occasionally. Taste for salt."
  ]
},
{
  id: 15, title: "Italian Meatloaf", category: "main",
  mealType: ["dinner"],
  cuisine: ["italian"], mood: ["comfort"], seasonal: [],
  time: "2 hrs 50 min", serves: "8-12",
  ingredients: [
    "6 slices crusty Italian bread",
    "1 cup milk",
    "2 pounds ground beef",
    "1 cup freshly grated Parmesan cheese",
    "4 large eggs",
    "1/3 cup minced parsley",
    "1 tablespoon Italian seasoning",
    "1 teaspoon kosher salt",
    "1/2 teaspoon black pepper",
    "Two 14.5-ounce cans diced tomatoes, drained",
    "1/4 cup packed brown sugar",
    "1 teaspoon dry mustard",
    "Pinch of cayenne pepper",
    "A few dashes of Worcestershire sauce",
    "12-16 thin slices pancetta (about 4 oz)"
  ],
  instructions: [
    "Preheat oven to 350°F. Tear the bread into chunks in a bowl, pour the milk over it, and let it soak a few minutes.",
    "In a large bowl, combine the ground beef, milk-soaked bread, Parmesan, eggs, parsley, Italian seasoning, salt, and pepper. Mix with your hands until fully combined.",
    "In a separate bowl, stir together the tomatoes, brown sugar, mustard, cayenne, and Worcestershire.",
    "Shape the meat mixture into a loaf on a drip pan. Arrange the pancetta slices in an overlapping pattern over the top, then spoon the tomato mixture over everything.",
    "Tent with foil and bake 50 minutes. Remove the foil and bake 20-30 minutes more, until done in the middle (watch that the pancetta doesn't burn). Slice thick and serve."
  ]
},
{
  id: 16, title: "Fresh Homemade Pasta", category: "main",
  mealType: ["dinner"],
  cuisine: ["italian"], mood: ["fancy"], seasonal: [],
  time: "1 hr", serves: "8",
  source: "By chef Sarah Fioroni, Fattoria Poggio Alloro, Tuscany",
  ingredients: [
    "2 cups (220g) semolina flour",
    "2 cups (220g) all-purpose flour",
    "6 eggs",
    "1 tablespoon salt"
  ],
  instructions: [
    "Mix the flours together on a clean work surface and form into a tall mound with a well in the center. Crack the eggs into the well and gently beat with a fork, drawing in a little flour with each stroke — this takes patience and cannot be rushed.",
    "As the dough thickens, work in the rest of the flour with your hands and knead until firm and elastic. Divide into two balls, cover, and let rest about 20 minutes.",
    "Roll one portion into a large, paper-thin rectangle on a floured surface, then flour the surface and roll it up. Repeat with the second ball.",
    "For lasagna, cut into strips 4 1/2 inches wide and let dry 2 hours. For tagliatelle, cut strips about 3/8 inch wide; for tagliolini, about 1/8 inch wide — unroll, toss with semolina flour, and let dry about 1 hour.",
    "Cook in a rolling boil of salted water about 5 minutes. Drain well and use in your recipe."
  ]
},
{
  id: 17, title: "Tagliolini Pasta with Spring Vegetables & Saffron", category: "main",
  mealType: ["dinner"],
  cuisine: ["italian"], mood: ["fancy","healthy"], seasonal: ["zucchini","peas"],
  time: "40 min", serves: "8",
  source: "By chef Sarah Fioroni, Fattoria Poggio Alloro, Tuscany",
  ingredients: [
    "4 tablespoons (60ml) extra-virgin olive oil",
    "1/2 cup diced white onion",
    "2 cups diced or sliced zucchini",
    "2 cups fresh spring peas",
    "1/2 teaspoon saffron threads",
    "3 tablespoons fresh cream",
    "22 ounces (650g) fresh tagliolini pasta",
    "Grated Parmesan cheese (optional)"
  ],
  instructions: [
    "Heat the olive oil in a large non-stick pan and sauté the onion over medium heat until wilted and transparent, about 5 minutes.",
    "Add the zucchini and peas, season with salt, and cook 15 minutes, stirring to prevent sticking and adding water as needed. Stir in the saffron and cook 10 more minutes.",
    "Bring a large pot of salted water to a boil. Cook the tagliolini until al dente, about 4 minutes — it's nearly ready once it rises to the surface.",
    "Drain the pasta and add it to the pan with the vegetables and saffron. Add the cream and toss over medium heat 2 minutes to combine.",
    "Serve immediately with a little Parmesan scattered over the top."
  ],
  note: "Wine pairing: Vernaccia di San Gimignano DOCG \"Il Nicchiaio\""
},
{
  id: 18, title: "Zucchini Pie", category: "main",
  mealType: ["dinner"],
  cuisine: ["italian"], mood: ["comfort","healthy"], seasonal: ["zucchini"],
  time: "1 hr", serves: "6",
  source: "From: Nani",
  ingredients: [
    "2 medium zucchini, scrubbed clean, sliced into 1/8\" slices",
    "1 cup grated Swiss or mozzarella cheese",
    "2 tablespoons chopped onion",
    "4 eggs",
    "2 cups milk",
    "1/2 teaspoon basil or oregano",
    "1 cup Bisquick",
    "1/4 teaspoon salt",
    "Speck of pepper"
  ],
  instructions: [
    "Heat oven to 400°F. Grease a pie plate.",
    "Place the zucchini, onion, and cheese in the pie plate.",
    "Beat the remaining ingredients until smooth and pour over the zucchini.",
    "Bake about 35-40 minutes, until a knife comes out clean."
  ]
},
{
  id: 19, title: "Pad Thai", category: "main",
  mealType: ["dinner"],
  cuisine: ["asian"], mood: ["comfort"], seasonal: [],
  time: "1 hr 10 min", serves: "4",
  ingredients: [
    "6 cloves garlic, chopped",
    "1/2 cup chopped shallots",
    "1/4 cup fish sauce",
    "70g palm sugar",
    "6-8 tablespoons tamarind paste (start with less if it makes you pucker)",
    "1 tablespoon vegetable oil",
    "Meat of choice",
    "Soy sauce, salt, pepper (for the meat)",
    "Rice noodles (about 2 oz dried per person)",
    "Bean sprouts",
    "Roasted peanuts, chopped",
    "Garlic chives or green onion",
    "Chili flakes",
    "Lime",
    "Egg"
  ],
  instructions: [
    "▸ Sauce",
    "Heat the oil in a medium pot. Add the garlic and shallots and sauté until translucent; remove from the pot.",
    "In the same pot, add the palm sugar and let it melt and caramelize. Remove from heat, add the tamarind paste, then return to heat and add the fish sauce.",
    "Once the sugar is mostly dissolved, remove from heat and stir in the garlic and shallots. Store in a jar; to use, mix 1 part sauce to 1.5 parts water.",
    "▸ To eat (1 serving)",
    "Heat a fry pan with oil. Add the soaked rice noodles (30 min-1 hr) with the sauce/water mixture. Add bean sprouts, chives/onions, chili flakes, peanuts, and seasoned cooked meat; stir-fry.",
    "Push everything to one side, crack an egg into the pan and break the yolk. Place noodles on top of the egg as it cooks; once browned underneath, stir-fry to combine.",
    "Transfer to a bowl and top with more chives, peanuts, and lime juice."
  ]
},
{
  id: 20, title: "Mac & Cheese Sauce", category: "side",
  mealType: ["dinner"],
  cuisine: ["american"], mood: ["comfort"], seasonal: [],
  time: "20 min",
  note: "This is the cheese sauce only — pairs with your cooked, drained macaroni.",
  ingredients: [
    "4 tablespoons unsalted butter (1/2 stick)",
    "4 tablespoons all-purpose flour",
    "1 teaspoon kosher salt",
    "2 cups milk",
    "2 cups shredded cheese (10 slices American + 10 slices cheddar works well)"
  ],
  instructions: [
    "Melt the butter in a 1-quart saucepan.",
    "Whisk in the flour and salt, stirring and cooking over medium heat until the roux bubbles and turns pale brown, about 3 minutes.",
    "Slowly whisk in 1 cup milk, then the remaining cup. Cook, stirring constantly, until the sauce thickens.",
    "Add the cheese and stir until melted. Mix in the drained macaroni."
  ]
},
{
  id: 21, title: "Pastina", category: "main",
  mealType: ["dinner"],
  cuisine: ["italian"], mood: ["comfort"], seasonal: [],
  time: "20 min",
  ingredients: [
    "1 1/4 cups water",
    "Not quite 1 cup pastina",
    "Approx. 1 teaspoon salt",
    "2 tablespoons butter",
    "6 tablespoons milk",
    "2-4 slices American cheese"
  ],
  instructions: [
    "Bring the water to a boil, add salt and pastina. Cook on low until the water is almost absorbed, stirring throughout.",
    "Add the butter and milk and stir until absorbed, adding more milk if the pastina isn't fully cooked.",
    "Add the cheese and stir constantly until melted. Serve."
  ]
},
{
  id: 22, title: "Pork & Green Bean Stir Fry", category: "main",
  mealType: ["dinner"],
  cuisine: ["asian"], mood: ["healthy"], seasonal: ["green beans"],
  time: "45 min", serves: "4",
  ingredients: [
    "Pork tenderloin, cut into 1 1/2-inch strips",
    "4 tablespoons soy sauce, divided",
    "1 1/2 tablespoons honey, divided",
    "2 garlic cloves, minced, divided",
    "1 lb green beans, cut into 1/2-inch pieces",
    "1 cup matchstick carrots",
    "2 tablespoons canola oil",
    "1 bell pepper (or extra other veg)",
    "1 tablespoon ginger",
    "Green onions, chopped, for garnish",
    "Roasted peanuts, chopped, for garnish"
  ],
  instructions: [
    "Mix the pork with 1 tablespoon soy sauce, 1 tablespoon honey, and 1 clove garlic in a bowl. In a separate small bowl, mix the remaining 3 tablespoons soy sauce and 1/2 tablespoon honey; set aside.",
    "Cook the green beans in boiling salted water, adding the carrots when almost done — keep the vegetables slightly crisp. Drain.",
    "Heat 1 tablespoon canola oil in a frying pan. Stir-fry the pork until cooked; transfer to a dish.",
    "Add the vegetables, remaining garlic, and ginger to the pan; stir-fry. Return the pork with the soy-honey mixture and season to taste.",
    "Serve over white rice, topped with green onion and peanuts."
  ]
},
{
  id: 23, title: "Nani's Rice & Beans", category: "main",
  mealType: ["dinner"],
  cuisine: ["caribbean"], mood: ["comfort"], seasonal: [],
  time: "45 min", serves: "4-6",
  source: "From: Nani",
  ingredients: [
    "Oil",
    "2 tablespoons recaito",
    "3 sazón packets with cilantro",
    "1-2 cans green pigeon peas",
    "1 lb long grain white rice",
    "Salt & pepper"
  ],
  instructions: [
    "Cover the bottom of the pan with oil and the recaito. When it starts to bubble, add the sazón packets, then the pigeon peas and 3 1/2 to 4 cans of water (add more later if needed). Season with salt and pepper.",
    "Bring to a boil. Wash the rice until the water runs clear, then add it — water should cover it by 1 inch. Add one more seasoning packet if desired.",
    "Bring back to a boil, stir, then reduce to very low heat for 20-30 minutes."
  ]
},
{
  id: 24, title: "Best Fluffy White Rice", category: "side",
  mealType: ["dinner"],
  cuisine: ["asian"], mood: ["healthy"], seasonal: [],
  time: "25 min",
  ingredients: [
    "1 cup rice",
    "1.5 cups water"
  ],
  instructions: [
    "Place the rice (no rinsing) in a pot with the water. Bring to a boil.",
    "Reduce heat and cover — not before — for 13 minutes.",
    "Turn off the heat and leave the covered pot off the stove for 10 minutes. Fluff with a fork."
  ],
  note: "If rinsing the rice first, use 2 tablespoons less water per cup of rice."
},
{
  id: 25, title: "Roasted Ratatouille Pasta", category: "main",
  mealType: ["dinner"],
  cuisine: ["italian","french"], mood: ["healthy","comfort"], seasonal: ["zucchini","eggplant","tomato"],
  time: "1 hr 10 min", serves: "3",
  source: "Adapted from The Woks of Life",
  ingredients: [
    "2 cups zucchini, diced",
    "2 cups eggplant, diced",
    "1 onion, diced",
    "1/4 cup olive oil",
    "4 cloves garlic, minced",
    "1 medium onion, minced",
    "5 sun-dried tomatoes, minced",
    "1 tablespoon tomato paste",
    "1 teaspoon dried Italian herb seasoning",
    "1/4 teaspoon dried thyme",
    "1/4 teaspoon dried basil",
    "1 1/4 teaspoon salt",
    "1/4 teaspoon fresh ground pepper",
    "8 oz spaghetti",
    "Fresh basil and parsley, to serve",
    "Parmesan cheese, to serve"
  ],
  instructions: [
    "Preheat oven to 400°F. In a large bowl, combine the diced zucchini, eggplant, and onion.",
    "In a small bowl, combine the olive oil, minced garlic, minced onion, sun-dried tomatoes, tomato paste, herbs, salt, and pepper. Toss with the vegetables to coat.",
    "Spread evenly on a parchment-lined sheet pan and roast 45 minutes, stirring once halfway through.",
    "Cook the spaghetti until al dente and toss with the roasted vegetables, fresh basil, parsley, and Parmesan."
  ]
},

// ── GRAVIES & SAUCES ─────────────────────────────────────────────
{
  id: 26, title: "Marinara Sauce", category: "sauce",
  mealType: ["dinner"],
  cuisine: ["italian"], mood: ["comfort"], seasonal: ["tomato"],
  time: "35 min",
  pairsWith: "Tossed with a pound of spaghetti or your favorite pasta shape.",
  note: "This handwritten card was cut off partway through in the original — the last step or two didn't survive. It's still delicious as a simple simmered marinara.",
  ingredients: [
    "1 large can plum tomatoes, 1/2 cup water",
    "2 tablespoons olive oil",
    "2 large cloves garlic, pressed or minced well",
    "1/4 cup fresh basil, chopped if using large leaves",
    "Salt & fresh cracked pepper to taste",
    "1/2 cup grated Romano cheese"
  ],
  instructions: [
    "Coarsely chop the tomatoes in a 2-quart saucepan.",
    "Add all other ingredients and simmer gently for 1/2 hour.",
    "Optional addition: 2 cans minced clams, stirred in near the end."
  ]
},
{
  id: 27, title: "Chimichurri", category: "sauce",
  mealType: ["dinner"],
  cuisine: ["caribbean"], mood: ["healthy","fancy"], seasonal: [],
  time: "10 min + rest",
  pairsWith: "Spooned over a grilled steak or grilled chicken — the classic pairing.",
  ingredients: [
    "1/2 cup olive oil",
    "2 tablespoons red wine vinegar",
    "1/2 cup chopped parsley",
    "3-4 cloves garlic",
    "3/4 teaspoon dried oregano",
    "1 teaspoon salt",
    "1/2 teaspoon pepper",
    "Chili flakes to taste"
  ],
  instructions: [
    "Mix all ingredients together.",
    "Let sit a few hours, or overnight, in the fridge before serving."
  ]
},
{
  id: 28, title: "Ginger Vinaigrette", category: "sauce",
  mealType: ["dinner"],
  cuisine: ["asian"], mood: ["healthy"], seasonal: [],
  time: "10 min",
  pairsWith: "Tossed over a simple green salad, slaw, or cold noodles.",
  ingredients: [
    "1/4 cup rice vinegar",
    "1/4 cup vegetable oil",
    "1 1/2 tablespoons sugar",
    "1 tablespoon finely grated ginger",
    "Kosher salt and freshly ground pepper"
  ],
  instructions: [
    "Mix the rice vinegar with the sugar and grated ginger until the sugar dissolves.",
    "Whisk in the vegetable oil and season with salt and pepper."
  ]
},
{
  id: 29, title: "Homemade Salsa", category: "sauce",
  mealType: ["dinner"],
  cuisine: ["mexican"], mood: ["healthy"], seasonal: ["tomato"],
  time: "5 min", serves: "about 1 quart+",
  pairsWith: "Tortilla chips, or spooned over tacos, quesadillas, or grilled chicken.",
  ingredients: [
    "1.25 lbs (5-6) Roma tomatoes",
    "1 (14.5 oz) can diced tomatoes",
    "2 green onions",
    "1/3 cup chopped red onion (about 1/2 small)",
    "1 jalapeño pepper, seeded",
    "Handful of cilantro",
    "1-2 garlic cloves",
    "2 tablespoons lime juice",
    "1/2 teaspoon chili powder",
    "1/4 teaspoon ground cumin",
    "1/2 teaspoon sugar (optional)",
    "Salt & pepper"
  ],
  instructions: [
    "Combine everything in a blender or food processor and blitz to your desired consistency.",
    "Store 1-2 weeks in the fridge."
  ]
},
{
  id: 30, title: "Greek Chicken Marinade", category: "sauce",
  mealType: ["dinner"],
  cuisine: ["greek"], mood: ["healthy"], seasonal: [],
  time: "10 min + overnight",
  ingredients: [
    "1/4 cup olive oil",
    "1 tablespoon red wine vinegar",
    "1 lemon, juice only",
    "1 teaspoon honey",
    "1 teaspoon garlic powder",
    "2 teaspoons dried oregano",
    "1/2 teaspoon salt (more to taste)",
    "1/4 teaspoon ground paprika",
    "1/4 teaspoon ground black pepper",
    "1 lb chicken"
  ],
  instructions: [
    "Mix the marinade ingredients (add more olive oil to thin it into a dressing, if using it that way).",
    "If marinating, combine with the chicken in a bag and refrigerate overnight.",
    "Cook the chicken on a grill pan."
  ]
},

// ── BREADS ───────────────────────────────────────────────────────
{
  id: 31, title: "Grandpa's Soda Bread", category: "bread",
  mealType: ["breakfast", "dinner"],
  cuisine: ["irish"], mood: ["comfort"], seasonal: [],
  time: "1 hr 15 min",
  story: "This is my grandfather's Irish soda bread. He taught the recipe to Emily before he passed away, before I was even old enough to remember him. Ever since, it's what Dad makes with us every year for St. Patrick's Day — keeping the tradition, and a piece of Grandpa, alive at our table.",
  ingredients: [
    "3 1/2 cups sifted flour",
    "2/3 cup sugar",
    "1 teaspoon salt",
    "1 tablespoon baking powder",
    "1 1/2 cups seedless raisins",
    "1 tablespoon caraway seeds",
    "2 eggs, lightly beaten",
    "1 1/2 cups buttermilk",
    "2 tablespoons melted butter"
  ],
  instructions: [
    "Preheat oven to 375°F. Grease an 8 1/2-inch loaf pan.",
    "Sift together the dry ingredients and add the raisins and caraway seeds.",
    "Combine the eggs, butter, and buttermilk; add to the dry ingredients and mix until just moistened.",
    "Turn into the pan and bake 1 hour."
  ]
},
{
  id: 32, title: "Baked Soft Pretzels", category: "bread",
  mealType: ["dinner"],
  cuisine: ["american"], mood: ["comfort"], seasonal: [],
  time: "40 min", serves: "8-16",
  ingredients: [
    "1 1/2 cups (360ml) warm water",
    "2 1/4 teaspoons (7g) instant/active dry yeast",
    "1 teaspoon salt",
    "1 tablespoon brown sugar",
    "1 tablespoon (14g) unsalted melted butter",
    "3 3/4-4 cups (460-500g) all-purpose flour",
    "Coarse salt, for topping",
    "▸ Baking soda bath",
    "1/2 cup (120g) baking soda",
    "9 cups water"
  ],
  instructions: [
    "Whisk the yeast into the warm water and let sit 1 minute. Whisk in the salt, brown sugar, and melted butter.",
    "Slowly add the flour, 1 cup at a time, until the dough is no longer sticky. Knead by hand about 5 minutes until it passes the windowpane test.",
    "Shape into a ball, cover with a towel, and rest 10 minutes.",
    "Meanwhile, boil the water with the baking soda and preheat the oven to 400°F.",
    "Cut the dough into 8 or 16 sections and shape into pretzels. Dip 1-2 at a time into the boiling baking soda bath for 20-30 seconds, then place on a baking sheet and sprinkle with coarse salt.",
    "Bake 12-15 minutes, until golden brown."
  ]
},
{
  id: 33, title: "Croissants", category: "bread",
  mealType: ["breakfast"],
  cuisine: ["french"], mood: ["fancy"], seasonal: [],
  time: "Overnight + 3 hrs", serves: "16",
  source: "Adapted from a French baking cookbook",
  ingredients: [
    "20g (3/4 oz) yeast",
    "375ml (13 fl oz) warm water",
    "625g (1 lb 6 oz) strong white flour, plus extra for dusting",
    "5g (1/8 oz) salt",
    "75g (3 oz) caster sugar",
    "500g (1 lb 2 oz) butter, chilled",
    "1 egg, beaten, for egg wash"
  ],
  instructions: [
    "Dissolve the yeast in the warm water. Mix the flour, salt, and sugar in a large bowl, then gradually stir in the yeast mixture until the dough comes together. Knead until elastic, then refrigerate 1 hour.",
    "Roll the chilled dough into a large rectangle. Flatten the chilled butter into a rectangle covering two-thirds of the dough; lay it over the dough and fold in thirds like a letter to encase it. Chill 1 hour.",
    "Roll out to the same size rectangle and repeat the fold. Chill 1 hour. Repeat this rolling-and-folding twice more, then wrap and rest overnight in the fridge.",
    "The next day, cut the dough in half and roll each piece into a large square. Cut each into quarters, then each quarter diagonally into two triangles. Roll each triangle from the wide end to the point, curving the ends inward. Let rise on baking trays for 1 hour.",
    "Preheat oven to 400°F. Brush with egg wash and bake 10-15 minutes until golden brown. Cool on a wire rack."
  ]
},

// ── HOLIDAY COOKIES & TREATS ─────────────────────────────────────
{
  id: 34, title: "Grand Floridian Gingerbread", category: "dessert",
  mealType: ["dessert"],
  cuisine: ["american"], mood: ["fancy"], seasonal: [],
  time: "3-6 hrs (incl. chilling)",
  story: "This one came from the most magical place in the world: Disney. Disney was a huge part of my childhood — we went often, and it always felt like a second home. On one trip, we had the best gingerbread we'd ever tasted at the Grand Floridian, so good that Dad worked up the nerve to ask the gingerbread house maker there if we could possibly have the recipe. Somehow, it worked — and now a little bit of Disney magic shows up in our kitchen every Christmas.",
  ingredients: [
    "2 sticks butter, softened",
    "2 1/2 cups confectioners' sugar, sifted",
    "2 eggs",
    "1/2 teaspoon salt",
    "1 teaspoon ground fennel",
    "1 teaspoon ground ginger",
    "1 teaspoon ground cloves",
    "3 2/3 cups all-purpose flour",
    "2 1/2 teaspoons ground cinnamon",
    "2 1/4 teaspoons ground coriander",
    "2 teaspoons ground star anise",
    "1 1/4 teaspoons baking powder",
    "1/4 teaspoon ground mace",
    "1/4 cup milk",
    "Colored sugar"
  ],
  instructions: [
    "Combine the butter and sugar in a mixer and beat until smooth. Beat in the eggs.",
    "Sift together the flour, cinnamon, coriander, anise, baking powder, ginger, cloves, salt, and mace in a separate bowl.",
    "With the mixer on low, gradually add the dry ingredients to the butter mixture until the dough holds together.",
    "Wrap in plastic and refrigerate until firm, 2-4 hours.",
    "Preheat oven to 350°F. Roll the dough to 1/8-inch thickness and cut into shapes.",
    "Brush lightly with milk and sprinkle with colored sugar. Bake 10-14 minutes, until firm and the edges begin to darken."
  ]
},
{
  id: 35, title: "Peanut Blossoms", category: "dessert",
  mealType: ["dessert"],
  cuisine: ["american"], mood: ["comfort"], seasonal: [],
  time: "35 min", serves: "48 cookies",
  story: "Christmas cookie baking has always been its own adventure in our family. For years, it meant an afternoon in the kitchen with Grandma, flour everywhere, and trays of Peanut Blossoms and Icy Walnut Balls coming out one after another. More recently, a new tradition took root: baking cookies with my friend Jake every year after Thanksgiving. This year, that tradition comes to an end as I graduate from West Point — but the cookies, and the memory of standing in the kitchen with Grandma, and later with Jake, aren't going anywhere.",
  ingredients: [
    "1 3/4 cups all-purpose flour",
    "1 teaspoon baking soda",
    "1/2 teaspoon salt",
    "1/2 cup sugar",
    "1/2 cup firmly packed brown sugar",
    "1/2 cup shortening",
    "1/2 cup peanut butter",
    "1 egg",
    "2 tablespoons milk",
    "1 teaspoon vanilla extract",
    "48 milk chocolate candy kisses"
  ],
  instructions: [
    "Combine all ingredients except the candy kisses in a large mixer bowl and blend well.",
    "Shape into balls using a rounded teaspoon. Roll in additional sugar and place on ungreased cookie sheets.",
    "Bake at 375°F for 10-12 minutes.",
    "Remove from the oven and immediately top each cookie with a candy kiss, pressing down firmly so the cookie cracks around the edge."
  ]
},
{
  id: 36, title: "Icy Walnut Balls", category: "dessert",
  mealType: ["dessert"],
  cuisine: ["american"], mood: ["comfort"], seasonal: [],
  time: "40 min", serves: "50 cookies",
  ingredients: [
    "1 cup all-purpose flour",
    "1/4 cup firmly packed brown sugar",
    "1/3 cup butter",
    "1 cup chopped walnuts, divided",
    "3/4 cup sweetened condensed milk",
    "1 teaspoon orange extract",
    "3 cups confectioners' sugar",
    "1 cup chopped dates"
  ],
  instructions: [
    "Combine the flour, brown sugar, and butter in a large bowl and blend to form coarse crumbs. Stir in 1/2 cup of the walnuts and spread in a 13x9-inch pan.",
    "Bake at 400°F for 10-12 minutes, stirring occasionally, until toasted and golden brown. Cool.",
    "In the same bowl, combine the condensed milk, orange extract, and confectioners' sugar. Stir in the dates and remaining walnuts.",
    "Drop by scant teaspoons into the crumb mixture and shape into balls, rolling to coat. Store in the refrigerator."
  ],
  note: "Variation: substitute 1 cup chopped candied fruit or candied cherries for the dates."
},
{
  id: 37, title: "Cuccidati (Italian Fig Cookies)", category: "dessert",
  mealType: ["dessert"],
  cuisine: ["italian"], mood: ["fancy"], seasonal: [],
  time: "1 hr", serves: "16",
  note: "Bake time wasn't specified on the original card — start checking around 20 minutes at 315°F.",
  ingredients: [
    "▸ Dough",
    "4 cups flour",
    "1 1/2 tablespoons baking powder",
    "1/2 teaspoon salt",
    "1/4 cup sugar",
    "1 cup vegetable shortening",
    "1 egg",
    "1/2 cup milk",
    "▸ Filling",
    "2 cups dried figs",
    "2 cups pitted dates",
    "1 cup raisins",
    "1/2 cup honey",
    "1 teaspoon cinnamon",
    "1/2 cup orange marmalade",
    "1 1/2 cups chopped walnuts"
  ],
  instructions: [
    "Knead the dough ingredients together until smooth.",
    "Pulse the filling ingredients in a food processor to coarsely chop. Preheat oven to 315°F.",
    "Cut the dough into 4 pieces and roll each into a 12-inch square on a cookie sheet. Cut into a 4x3 grid, spooning 2 tablespoons of filling onto each piece.",
    "Fold the dough on both sides to meet in the center, pinch the ends closed, and brush with egg wash.",
    "Bake until lightly golden."
  ]
},
{
  id: 38, title: "Chocolate Sandwich Cookies", category: "dessert",
  mealType: ["dessert"],
  cuisine: ["american"], mood: ["comfort"], seasonal: [],
  time: "1 hr 15 min", serves: "42-48 sandwiches",
  note: "The flour/soda/salt/sugar/shortening amounts at the start of the original ingredient list were cut off in the scan and couldn't be recovered — a standard rolled sugar-cookie base (about 2 1/2 cups flour, 1 tsp baking soda, 1/2 tsp salt, 1 cup sugar, 1/2 cup shortening) will work well here.",
  ingredients: [
    "3 (1-ounce) envelopes unsweetened chocolate, melted",
    "1/4 cup milk",
    "1 teaspoon vanilla extract",
    "▸ Peppermint frosting",
    "1 package (small) Pillsbury Buttercream Vanilla Frosting Mix, prepared as directed",
    "1 drop red food coloring",
    "1/8 teaspoon peppermint extract"
  ],
  instructions: [
    "Combine all the cookie ingredients in a large mixer bowl and blend well. Chill at least 1/2 hour.",
    "Roll out on a floured surface to 1/8-inch thickness. Cut with a 2-inch round cutter and place on ungreased cookie sheets.",
    "Bake at 400°F for 6-8 minutes. Cool completely.",
    "Prepare the frosting mix as directed, adding the red food coloring and peppermint extract.",
    "Spread half of the cookies with frosting and top with the remaining cookies, sandwich-style."
  ]
},
{
  id: 39, title: "Old-Fashioned Pumpkin Cookies", category: "dessert",
  mealType: ["dessert"],
  cuisine: ["american"], mood: ["comfort"], seasonal: ["pumpkin"],
  time: "45 min",
  ingredients: [
    "2 1/2 cups all-purpose flour",
    "1 teaspoon baking soda",
    "1 teaspoon baking powder",
    "1 teaspoon ground cinnamon",
    "1/2 teaspoon ground nutmeg",
    "1/2 teaspoon salt",
    "1 1/2 cups granulated sugar",
    "1/2 cup (1 stick) butter, softened",
    "1 cup pumpkin puree",
    "1 large egg",
    "2 teaspoons vanilla extract, divided",
    "2 cups powdered sugar, sifted",
    "1 tablespoon milk",
    "1 tablespoon butter, softened"
  ],
  instructions: [
    "Preheat oven to 350°F. Grease baking sheets.",
    "Combine the flour, baking soda, baking powder, cinnamon, nutmeg, and salt in a bowl. In a large mixer bowl, beat the sugar and butter until well blended; beat in the pumpkin, egg, and 1 teaspoon vanilla until smooth. Gradually beat in the flour mixture.",
    "Drop by rounded tablespoons onto the prepared sheets. Bake 15-18 minutes, until the edges are firm. Cool 2 minutes on the sheet, then move to a wire rack.",
    "Combine the powdered sugar, milk, remaining butter, and remaining vanilla until smooth. Drizzle over the cooled cookies."
  ]
},
{
  id: 40, title: "Granola Cookies", category: "dessert",
  mealType: ["dessert"],
  cuisine: ["american"], mood: ["healthy"], seasonal: ["pumpkin","cranberries"],
  time: "1 hr 20 min", serves: "~24",
  ingredients: [
    "1/2 cup virgin coconut oil",
    "1 cup packed light brown sugar",
    "2 large eggs",
    "1 teaspoon pure vanilla extract",
    "1 1/4 cups all-purpose flour",
    "1/2 teaspoon baking soda",
    "1 teaspoon coarse salt",
    "1/2 cup old-fashioned rolled oats",
    "1/4 cup flaxseed meal",
    "1/2 cup hulled pumpkin seeds (pepitas)",
    "3/4 cup large unsweetened coconut flakes",
    "5 ounces bittersweet chocolate, coarsely chopped (about 1 cup)",
    "1 cup unsweetened dried cherries or cranberries, chopped"
  ],
  instructions: [
    "Preheat oven to 350°F. Beat the coconut oil and brown sugar until well combined, about 3 minutes. Beat in the eggs and vanilla. Add the flour, baking soda, and salt; beat until combined. Stir in the remaining ingredients. Refrigerate the dough until firm, about 1 hour.",
    "Drop heaping tablespoons of dough 2 inches apart onto parchment-lined baking sheets. Bake until golden, rotating halfway through, 13-14 minutes.",
    "Let cool completely on a wire rack before removing."
  ],
  note: "For gluten-free cookies, substitute a 1:1 gluten-free flour blend and use gluten-free oats. For whole grain, swap in spelt flour."
},
{
  id: 41, title: "Biscotti", category: "dessert",
  mealType: ["dessert"],
  cuisine: ["italian"], mood: ["fancy"], seasonal: [],
  time: "1 hr", serves: "a lot",
  source: "From: Annie",
  ingredients: [
    "1 cup sugar",
    "1/2 cup oil, butter, or crisco (your choice)",
    "4 eggs, lightly beaten, added one at a time",
    "4 teaspoons vanilla",
    "4 cups flour",
    "4 teaspoons baking powder",
    "1/2 teaspoon salt"
  ],
  instructions: [
    "Cream together the sugar and oil/butter/crisco. Add the eggs one at a time, then the vanilla.",
    "Mix the flour, baking powder, and salt together, then gradually add to the creamed mixture to make a dough. Keep the dough covered with a towel while working with about 1/4 of it at a time.",
    "Roll into ropes on a lightly oiled surface with lightly oiled hands, and shape into whatever form you like.",
    "Bake at 375°F, about 6-8 minutes, until light brown — exact time depends on your oven. Age improves them!"
  ],
  note: "Can be made ahead. Best fresh — not the best when frozen."
},
{
  id: 42, title: "Italian Rainbow Cookies", category: "dessert",
  mealType: ["dessert"],
  cuisine: ["italian"], mood: ["fancy"], seasonal: [],
  time: "5.5 hrs (incl. chilling)", serves: "35 cookies",
  source: "Adapted from Tasting Table",
  ingredients: [
    "1 cup sugar",
    "3 sticks unsalted butter, softened and divided",
    "1/4 cup milk",
    "2 cups all-purpose flour",
    "1/4 teaspoon green food coloring",
    "1 1/2 cups semisweet chocolate chips, melted",
    "1 (8-ounce) can almond paste",
    "4 eggs, separated",
    "2 teaspoons almond extract",
    "1/4 teaspoon red food coloring",
    "1/2 cup raspberry jam, divided"
  ],
  instructions: [
    "Preheat oven to 325°F and grease three 9x13-inch quarter sheet pans, lining each with parchment.",
    "In a stand mixer, combine the sugar, almond paste, and one stick of butter; mix until smooth, breaking down the almond paste well. Add the remaining butter and mix until smooth.",
    "Gradually add the egg yolks, then the milk and almond extract. Add the flour and mix until just combined.",
    "In a separate bowl, whip the egg whites to stiff peaks, then fold into the batter. Divide the batter equally among three bowls.",
    "Tint one bowl pink, one green, and leave one plain. Spread each into its own pan and bake, rotating halfway, until set, 10-12 minutes. Cool completely.",
    "Spread half the jam over the green layer, top with the plain layer, spread the remaining jam on top, then add the pink layer.",
    "Cover with plastic wrap, weight down with a sheet pan and heavy plates, and refrigerate at least 4 hours or overnight.",
    "Spread half the melted chocolate over the top and chill until set, 30 minutes. Flip the cake over, spread the remaining chocolate over the new top, and chill again until set, 30 minutes.",
    "Trim into a neat rectangle and cut into 1 1/2-inch squares to serve."
  ]
},

// ── EVERYDAY COOKIES & SWEETS ─────────────────────────────────────
{
  id: 43, title: "Oatmeal Cookies", category: "dessert",
  mealType: ["dessert"],
  cuisine: ["american"], mood: ["comfort"], seasonal: [],
  time: "45 min",
  ingredients: [
    "1/2 pound (2 sticks) unsalted butter",
    "1 cup packed light brown sugar",
    "1 cup granulated sugar",
    "2 large eggs",
    "1 1/2 cups all-purpose flour",
    "1/2 teaspoon salt",
    "1/2 teaspoon baking powder",
    "3 cups rolled oats",
    "Optional: 1 1/2 cups raisins or chocolate chips"
  ],
  instructions: [
    "Heat oven to 350°F, racks in low and middle positions.",
    "Beat the butter until creamy. Add the sugars and beat until fluffy, about 3 minutes. Beat in the eggs one at a time.",
    "Whisk the flour, salt, and baking powder together, then stir into the butter mixture. Stir in the oats (and raisins/chips, if using).",
    "Roll into 2-inch balls and bake until the edges turn golden brown, 22-25 minutes."
  ]
},
{
  id: 44, title: "\"Sandy\" Lemon Butter Cookies", category: "dessert",
  mealType: ["dessert"],
  cuisine: ["american"], mood: ["comfort","fancy"], seasonal: [],
  time: "3 hrs (incl. chilling)",
  ingredients: [
    "1 cup butter",
    "2 cups sugar",
    "2 eggs, beaten",
    "1/4 cup milk",
    "2 teaspoons lemon (or vanilla) extract",
    "4 1/2 cups flour",
    "2 teaspoons baking powder",
    "1/2 teaspoon salt",
    "1/4 teaspoon baking soda"
  ],
  instructions: [
    "Preheat oven to 350°F.",
    "Cream the butter and sugar until light and fluffy. Add the eggs, milk, and extract.",
    "Combine the dry ingredients and gradually add to the creamed mixture. Cover and chill 2 hours.",
    "Roll out on a lightly floured surface to 1/8-inch thickness and cut with a floured 2-inch cutter.",
    "Bake 8-9 minutes, until the edges just begin to brown."
  ]
},
{
  id: 45, title: "Chocolate Chip Cookies", category: "dessert",
  mealType: ["dessert"],
  cuisine: ["american"], mood: ["comfort"], seasonal: [],
  time: "30 min",
  ingredients: [
    "2 1/4 cups flour",
    "1 teaspoon baking soda",
    "1 teaspoon salt",
    "1 cup (2 sticks) butter, softened",
    "3/4 cup granulated sugar (or 1 cup brown + 1/2 cup granulated for chewy cookies)",
    "1 teaspoon vanilla extract",
    "2 large eggs",
    "1 3/4 cups chocolate chips"
  ],
  instructions: [
    "Preheat oven to 375°F. Combine the flour, baking soda, and salt in a small bowl.",
    "Beat the butter, sugars, and vanilla in a large mixer bowl until creamy. Add the eggs one at a time, beating well after each. Gradually beat in the flour mixture, then stir in the chips.",
    "Drop by rounded tablespoons onto ungreased baking sheets. Bake 9-11 minutes."
  ],
  note: "Pan cookie variation: spread the dough in a greased 9x11 (or 10x15) pan and bake 20-30 minutes, depending on size — don't overbake."
},

// ── CAKES & SPECIAL OCCASIONS ─────────────────────────────────────
{
  id: 46, title: "Island Cheese Cake", category: "cake",
  mealType: ["dessert"],
  cuisine: ["caribbean"], mood: ["fancy"], seasonal: [],
  time: "9 hrs (incl. chilling)", serves: "12-16",
  ingredients: [
    "4 (8 oz) packages whipped cream cheese",
    "1 1/2 cups sugar",
    "4 large eggs",
    "Pinch salt",
    "1/3 cup corn starch",
    "2 tablespoons lemon juice",
    "1 teaspoon vanilla",
    "1 pint sour cream",
    "1 stick (1/2 cup) sweet butter, softened"
  ],
  instructions: [
    "Butter a 10\" or 12\" springform pan; set aside. Have all ingredients at room temperature.",
    "Mix everything well with a hand beater or stand mixer, about 6 minutes.",
    "Pour into the pan, then set the pan in a larger pan with about 1 inch of hot water.",
    "Bake in a preheated 325°F oven for 1 hour, then 30 minutes at 350°F. Test with a thin knife.",
    "Leave in the oven with the door ajar for 1 hour, then cool at room temperature for 1 hour.",
    "Chill at least 4 hours, remove from the pan, then chill an additional 2 hours."
  ],
  note: "May be topped with strawberry sauce, pineapple filling, or sliced sugared berries just before serving."
},
{
  id: 47, title: "Egg Nog Cake", category: "cake",
  mealType: ["dessert"],
  cuisine: ["american"], mood: ["fancy"], seasonal: ["citrus"],
  time: "1.5 hrs",
  source: "From: Great Grandma",
  ingredients: [
    "1 cup (1/2 lb) butter",
    "1/2 cup shortening",
    "3 cups sugar",
    "5 eggs",
    "3 cups sifted flour (unbleached)",
    "1 teaspoon baking powder",
    "1 cup sour cream",
    "1 teaspoon vanilla",
    "1 teaspoon lemon extract",
    "1 teaspoon almond extract",
    "1 teaspoon sherry",
    "1 teaspoon rum",
    "1 teaspoon brandy"
  ],
  instructions: [
    "Cream the butter and shortening until light and fluffy; beat in the sugar gradually until light and fluffy. Add the eggs one at a time, beating about 2 minutes after each.",
    "Add the sifted flour and baking powder alternately with the sour cream. Once blended, add the flavorings.",
    "Turn into a greased and floured tube (Bundt) pan or two loaf pans (or small loaf pans for holiday gifts).",
    "Bake at 350°F, checking with a cake tester (time depends on pan size). Turn out on a rack and let cool thoroughly before slicing."
  ]
},

// ── THANKSGIVING ────────────────────────────────────────────────
{
  id: 48, title: "Perfect Roast Turkey", category: "main",
  mealType: ["dinner"],
  cuisine: ["american"], mood: ["comfort","fancy"], seasonal: [],
  time: "3 hrs", serves: "8",
  source: "Recipe courtesy Barefoot Contessa Parties!, 2001",
  note: "Handwritten note on the original recipe: 2 hours on the BBQ.",
  ingredients: [
    "1/4 pound (1 stick) unsalted butter",
    "1 lemon, zested and juiced",
    "1 teaspoon chopped fresh thyme leaves",
    "1 fresh turkey (10-12 pounds)",
    "Kosher salt",
    "Freshly ground black pepper",
    "1 large bunch fresh thyme",
    "1 whole lemon, halved",
    "1 Spanish onion, quartered",
    "1 head garlic, halved crosswise"
  ],
  instructions: [
    "Preheat oven to 350°F.",
    "Melt the butter in a small saucepan; add the lemon zest and juice and the thyme leaves.",
    "Remove the giblets and wash the turkey inside and out; pat dry. Place in a large roasting pan. Season the cavity liberally with salt and pepper, then stuff with the thyme bunch, halved lemon, quartered onion, and garlic.",
    "Brush the outside with the butter mixture and season with salt and pepper. Tie the legs together and tuck the wing tips under the body.",
    "Roast about 2 1/2 hours, until the juices run clear between the leg and thigh. Rest, covered with foil, 20 minutes before carving."
  ]
},
{
  id: 49, title: "My Favorite Turkey Brine", category: "sauce",
  mealType: ["dinner"],
  cuisine: ["american"], mood: ["comfort"], seasonal: [],
  time: "25 min + 16-24 hrs brining", serves: "18",
  source: "By Ree Drummond",
  ingredients: [
    "3 cups apple juice or apple cider",
    "2 gallons cold water",
    "4 tablespoons fresh rosemary leaves",
    "5 cloves garlic, minced",
    "1 1/2 cups kosher salt",
    "2 cups brown sugar",
    "3 tablespoons peppercorns",
    "5 whole bay leaves",
    "Peel of 3 large oranges"
  ],
  instructions: [
    "Combine all ingredients in a large pot and bring to a boil, stirring until the salt and sugar dissolve. Turn off the heat, cover, and let the brine cool completely.",
    "Place the uncooked turkey in a large brining bag or pot, pour in the brine to cover it, and refrigerate 16-24 hours.",
    "Before roasting, remove the turkey (discard the brine) and submerge it in fresh cold water for 15 minutes to remove excess surface salt.",
    "Remove, pat very dry, and roast using your normal method."
  ]
},
{
  id: 50, title: "Thanksgiving Dressing", category: "side",
  mealType: ["dinner"],
  cuisine: ["american"], mood: ["comfort"], seasonal: [],
  time: "1 day + 45 min", serves: "18",
  source: "By Ree Drummond",
  ingredients: [
    "1 loaf cornbread",
    "1 loaf Italian bread, such as ciabatta",
    "1 loaf French bread",
    "1/2 cup butter",
    "1 large onion or 2 medium onions, diced",
    "5 stalks celery, diced",
    "6 cups low-sodium chicken broth, plus more if needed",
    "1/2 bunch parsley, chopped",
    "1 tablespoon fresh rosemary, finely minced",
    "1/2 teaspoon dried basil",
    "1/2 teaspoon ground thyme",
    "Salt and pepper, to taste"
  ],
  instructions: [
    "Cut all the bread into 1-inch cubes and spread on sheet pans. Cover with a dish towel and let dry out 24-48 hours until crisp.",
    "Melt the butter in a large skillet. Add the onions and celery and cook 3-4 minutes. Add the broth, parsley, rosemary, basil, thyme, salt, and pepper; stir.",
    "Put the bread cubes in a large bowl and slowly ladle in the broth mixture, tossing as you go until the dressing reaches your desired moisture level.",
    "Transfer to a large casserole pan and/or stuff into the turkey cavity. Bake at 375°F for 20-30 minutes, until golden and crisp on top."
  ]
},
{
  id: 51, title: "Candied Yams", category: "side",
  mealType: ["dinner"],
  cuisine: ["american"], mood: ["comfort"], seasonal: ["yams","sweet potato"],
  time: "1 hr 20 min",
  ingredients: [
    "6 yams (red garnet)",
    "2/3 stick butter",
    "1/2 box (8-10 oz) light brown sugar",
    "2 1/2 pints heavy whipping cream"
  ],
  instructions: [
    "Wash and cook the yams with the skin on until a knife comes out easily. Cool and peel.",
    "Cut into thick slices and arrange in a baking dish on the diagonal.",
    "For the sauce, melt the butter over low heat and stir in the brown sugar until caramelized.",
    "Pour in the cream slowly, stirring until it reaches a light caramel color.",
    "Pour the sauce over the yams, cover with foil, and bake at 350°F for 40 minutes, or until bubbly."
  ]
},
{
  id: 52, title: "Roasted Brussels Sprouts", category: "side",
  mealType: ["dinner"],
  cuisine: ["american"], mood: ["healthy"], seasonal: ["brussels sprouts","cranberries"],
  time: "35 min",
  ingredients: [
    "1 1/2 pounds Brussels sprouts",
    "4 ounces (120g) thick-cut bacon",
    "2 tablespoons extra-virgin olive oil",
    "1/4 teaspoon fine sea salt",
    "1/3 cup dried cranberries",
    "1/3 cup pepitas",
    "1 tablespoon thick balsamic vinegar",
    "A few thin pats of butter"
  ],
  instructions: [
    "Arrange an oven rack in the upper third position and preheat to 450°F.",
    "Cook the bacon in a large cast-iron pan over medium heat until rendered and crispy, about 5 minutes per side. Cool on a rack, then roughly chop.",
    "In the same pan, leave 1 tablespoon of bacon fat and add enough olive oil to coat the bottom. Once hot, place the Brussels sprouts cut-side down and leave undisturbed 3-4 minutes until dark and slightly charred. Flip, season with salt, and roast in the oven 12-14 minutes.",
    "Meanwhile, cover the cranberries with warm water to plump while the sprouts roast.",
    "Transfer the sprouts to a serving platter. Drain the cranberries and sprinkle on top with the pepitas. Drizzle with balsamic vinegar and add pats of butter for richness. Season with salt and pepper; serve warm or at room temperature."
  ]
},

// ── EVERYDAY WEEKNIGHT STAPLES ─────────────────────────────────────
// Simple, well-known dishes that aren't part of the family collection —
// standard versions based on well-tested recipes from reputable food
// publications (Food Network, The Woks of Life, The Mediterranean Dish,
// Spend with Pennies, Simply Delicious), written in-house rather than
// copied, with a source line for where the technique/ratios came from.
{
  id: 53, title: "Classic Grilled Cheese", category: "main",
  mealType: ["dinner"],
  cuisine: ["american"], mood: ["comfort"], seasonal: [],
  time: "10 min", serves: "1",
  source: "Adapted from Food Network Kitchen",
  ingredients: [
    "2 slices sandwich bread",
    "2 ounces sliced melting cheese (cheddar, American, Swiss, or a mix)",
    "1 tablespoon butter, mayonnaise, or oil, softened"
  ],
  instructions: [
    "Assemble the sandwich with the cheese between the two bread slices.",
    "Spread the butter (or mayonnaise) evenly over both outer sides of the sandwich.",
    "Heat a skillet over medium-low heat. Cook the sandwich 3-4 minutes per side, pressing gently, until deep golden brown on both sides and the cheese is fully melted.",
    "Slice and serve hot."
  ],
  note: "Scale up easily: for a crowd, bake assembled sandwiches on a sheet pan at 450°F for about 5 minutes per side instead of using the stovetop."
},
{
  id: 54, title: "Classic Tomato Soup", category: "soup",
  mealType: ["dinner"],
  cuisine: ["american"], mood: ["comfort"], seasonal: ["tomato"],
  time: "1 hr 25 min", serves: "4-6",
  source: "Adapted from Food Network Kitchen's \"The Best Tomato Soup\"",
  ingredients: [
    "2 tablespoons olive oil, plus more for serving",
    "1 stalk celery, diced",
    "1 small onion, diced",
    "2 cloves garlic, minced",
    "Kosher salt and freshly ground black pepper",
    "Two 28-ounce cans whole peeled tomatoes, crushed by hand",
    "1 1/2 cups vegetable broth",
    "1 teaspoon fresh thyme leaves",
    "4 tablespoons unsalted butter"
  ],
  instructions: [
    "Heat the olive oil in a large heavy-bottomed pot over medium heat. Add the celery, onion, garlic, and 1/2 teaspoon salt. Cook, stirring often, until softened but not browned, about 10 minutes.",
    "Stir in the crushed tomatoes, broth, and thyme. Cover and bring to a simmer, then cook 1 hour, stirring occasionally.",
    "Let cool 5 minutes. Working in batches, blend the soup with the butter until smooth (fill the blender no more than halfway, and vent the lid to let steam escape).",
    "Season with salt and pepper. Serve with a drizzle of olive oil — classic alongside a grilled cheese."
  ]
},
{
  id: 55, title: "Cheese Quesadillas", category: "main",
  mealType: ["dinner"],
  cuisine: ["mexican"], mood: ["comfort"], seasonal: [],
  time: "25 min", serves: "4",
  source: "Adapted from Bobby Flay, Food Network",
  ingredients: [
    "8 flour tortillas",
    "2 cups shredded cheddar cheese",
    "2 cups shredded Monterey Jack cheese",
    "Olive oil, for brushing"
  ],
  instructions: [
    "Brush one side of 4 tortillas lightly with oil; set them oiled-side down in a large skillet or on a griddle over medium heat.",
    "Top each with cheese, then close with a second tortilla.",
    "Cook until the bottom is browned and the cheese begins to melt, then flip carefully and brown the other side.",
    "Cut into wedges and serve hot, with salsa or sour cream if desired."
  ]
},
{
  id: 56, title: "Chicken Quesadillas", category: "main",
  mealType: ["dinner"],
  cuisine: ["mexican"], mood: ["comfort"], seasonal: ["tomato"],
  time: "30 min", serves: "4",
  source: "Adapted from a classic Food Network technique",
  ingredients: [
    "2 boneless, skinless chicken breasts, diced",
    "1 clove garlic, minced",
    "Salt and pepper",
    "2 cups canned stewed tomatoes",
    "4 large flour tortillas",
    "1 1/2 cups shredded cheddar cheese",
    "2 green onions, thinly sliced"
  ],
  instructions: [
    "Heat a lightly oiled pan over medium heat. Add the garlic, season with salt and pepper, and cook until fragrant.",
    "Add the chicken and cook through, about 6-8 minutes.",
    "Pour in the stewed tomatoes and simmer until most of the liquid has cooked off and the mixture is thick and paste-like. Stir in the green onions.",
    "Spoon the chicken mixture onto half of each tortilla, top with cheese, and fold over.",
    "Cook in a 500°F oven (or a hot skillet) until the cheese is melted and the tortilla is golden, a few minutes per side."
  ]
},
{
  id: 57, title: "Steak Tacos", category: "main",
  mealType: ["dinner"],
  cuisine: ["mexican"], mood: ["comfort"], seasonal: [],
  time: "35 min", serves: "4",
  source: "Adapted from Food Network Kitchen's \"Steak Tacos with Bell Pepper-Radish Salad\"",
  ingredients: [
    "1 flank steak (about 1 1/4 lbs)",
    "Zest and juice of 1 lime, plus wedges for serving",
    "1 tablespoon chile powder",
    "5 tablespoons vegetable oil, divided",
    "1 tablespoon honey, divided",
    "Kosher salt and pepper",
    "2 cups fresh cilantro, plus more for topping",
    "2 scallions, roughly chopped",
    "2 bell peppers, thinly sliced",
    "4 radishes, thinly sliced",
    "12 corn tortillas",
    "1/2 cup crumbled queso fresco"
  ],
  instructions: [
    "Combine the lime zest, chile powder, 1 tablespoon oil, and 2 teaspoons honey; rub over the steak and season with salt and pepper. Let sit at room temperature 10 minutes.",
    "Blend the cilantro, scallions, lime juice, remaining honey, and 1/2 teaspoon salt until chunky, then stream in the remaining oil to make a loose dressing. Toss half the dressing with the bell peppers and radishes; reserve the rest.",
    "Grill the steak over medium-high heat, 4-6 minutes per side for medium-rare. Rest 10 minutes, then slice thinly against the grain.",
    "Warm the tortillas. Serve the steak in tortillas topped with queso fresco, the reserved dressing, cilantro, the pepper-radish salad, and lime wedges."
  ]
},
{
  id: 58, title: "Grilled Chicken Tacos", category: "main",
  mealType: ["dinner"],
  cuisine: ["mexican"], mood: ["comfort","healthy"], seasonal: [],
  time: "30 min", serves: "4",
  source: "Adapted from Food Network Kitchen",
  ingredients: [
    "1 1/2 lbs boneless, skinless chicken breasts",
    "1/4 cup vegetable oil, plus more for the grill",
    "3 tablespoons chili powder",
    "Kosher salt",
    "12 corn tortillas",
    "Shredded cheese, pickled jalapeños, shredded lettuce, and/or salsa, for serving"
  ],
  instructions: [
    "Prepare a grill for medium heat. Mix the oil, chili powder, and 1 teaspoon salt into a paste.",
    "Pound the chicken breasts to an even 1/2-inch thickness and rub all over with the chili paste.",
    "Oil the grill grates and grill the chicken until cooked through, 3-4 minutes per side. Rest 5 minutes, then shred or slice into strips.",
    "Warm the tortillas on the grill. Serve the chicken in tortillas with cheese, pickled jalapeños, lettuce, and salsa as desired."
  ]
},
{
  id: 59, title: "Chicken Parmesan", category: "main",
  mealType: ["dinner"],
  cuisine: ["italian"], mood: ["comfort","fancy"], seasonal: ["lemon"],
  time: "40 min", serves: "6",
  source: "Adapted from Ina Garten's \"Parmesan Chicken,\" Food Network",
  ingredients: [
    "4-6 boneless, skinless chicken breasts, pounded to 1/4-inch thickness",
    "1 cup all-purpose flour",
    "2 teaspoons kosher salt",
    "1/2 teaspoon black pepper",
    "2 extra-large eggs",
    "1 tablespoon water",
    "1 1/4 cups seasoned dry breadcrumbs",
    "1/2 cup freshly grated Parmesan, plus more for serving",
    "Unsalted butter and olive oil, for frying",
    "▸ Lemon Vinaigrette (tossed with greens to serve alongside)",
    "1/4 cup fresh lemon juice",
    "1/2 cup olive oil",
    "1/2 teaspoon salt",
    "1/4 teaspoon pepper",
    "Baby arugula or mixed greens, to serve"
  ],
  instructions: [
    "Set up three shallow plates: flour seasoned with salt and pepper; eggs beaten with the water; breadcrumbs mixed with the Parmesan.",
    "Coat each chicken breast in flour, then egg, then the breadcrumb mixture, pressing gently to adhere.",
    "Heat a tablespoon each of butter and olive oil in a large sauté pan over medium-low heat. Cook the chicken in batches, 2-3 minutes per side, until golden and cooked through, adding more butter and oil as needed.",
    "Whisk together the lemon vinaigrette ingredients. Toss the greens with the vinaigrette and pile on top of the hot chicken. Serve with extra Parmesan."
  ],
  note: "For a red-sauce version, skip the salad topping and instead top each cutlet with warmed marinara and melted mozzarella — the family's own [[Marinara Sauce]] works well here."
},
{
  id: 60, title: "Spaghetti and Meatballs", category: "main",
  mealType: ["dinner"],
  cuisine: ["italian"], mood: ["comfort"], seasonal: ["tomato"],
  time: "1 hr 50 min", serves: "6",
  source: "Adapted from Food Network's \"Classic Spaghetti and Meatballs\"",
  ingredients: [
    "▸ Meatballs",
    "1/2 cup grated Parmesan, plus more for topping",
    "1/4 cup Italian breadcrumbs",
    "3 tablespoons milk",
    "1 large egg, beaten",
    "8 ounces ground beef chuck",
    "8 ounces ground pork",
    "1 teaspoon kosher salt",
    "1/2 teaspoon black pepper",
    "1 pound spaghetti",
    "Fresh basil, for garnish",
    "▸ Tomato Sauce",
    "4 pounds ripe plum tomatoes, or two 28-ounce cans diced tomatoes",
    "2 heads garlic, cloves peeled and halved lengthwise",
    "3/4 cup extra-virgin olive oil",
    "1 1/2 teaspoons red pepper flakes",
    "Salt and pepper",
    "1 cup chopped fresh basil"
  ],
  instructions: [
    "▸ Sauce",
    "If using fresh tomatoes, blanch in boiling water 10 seconds, shock in ice water, then peel, seed, and chop.",
    "Cook the garlic in the olive oil over medium heat until golden, 3-5 minutes. Add the tomatoes, pepper flakes, salt, pepper, and basil. Cover and simmer 1 hour, stirring occasionally.",
    "▸ Meatballs",
    "Preheat oven to 400°F and line a baking sheet with parchment.",
    "Combine the Parmesan, breadcrumbs, milk, and egg in a large bowl. Add the beef and pork, season with salt and pepper, and mix gently without overworking. Shape into golf-ball-size meatballs on the sheet.",
    "Bake until cooked through, about 15 minutes.",
    "▸ Bring it together",
    "Transfer the meatballs to the simmering sauce and cook 5 more minutes. Cook the spaghetti according to package directions and toss directly with the sauce.",
    "Serve topped with Parmesan and fresh basil."
  ]
},
{
  id: 61, title: "Classic Beef Burgers", category: "main",
  mealType: ["dinner"],
  cuisine: ["american"], mood: ["comfort"], seasonal: [],
  time: "20 min", serves: "4",
  source: "Adapted from Bobby Flay's \"Perfect Burger,\" Food Network",
  ingredients: [
    "1 1/2 lbs ground chuck (80% lean)",
    "Kosher salt and freshly ground black pepper",
    "1 1/2 tablespoons canola oil",
    "4 slices cheese (optional)",
    "4 hamburger buns, toasted if desired"
  ],
  instructions: [
    "Divide the meat into 4 portions (about 6 ounces each) and form loosely into 3/4-inch-thick patties, pressing a shallow thumbprint into the center of each. Season both sides with salt and pepper.",
    "Heat a grill, grill pan, or skillet over high heat and brush with oil.",
    "Cook the burgers about 3 minutes on the first side, then flip and cook 4 minutes more for medium-rare (add cheese in the last minute if using, covering briefly to melt).",
    "Rest a minute, then serve on toasted buns with your favorite toppings."
  ]
},
{
  id: 62, title: "Chicken Caesar Salad", category: "main",
  mealType: ["dinner"],
  cuisine: ["american"], mood: ["healthy"], seasonal: [],
  time: "40 min", serves: "4",
  source: "Adapted from Spend with Pennies",
  ingredients: [
    "4 boneless, skinless chicken breasts",
    "2 tablespoons olive oil, divided",
    "2 tablespoons Cajun seasoning",
    "8 cups chopped romaine lettuce",
    "1 1/2 cups croutons",
    "3/4 cup shredded Parmesan",
    "▸ Caesar Dressing",
    "1 cup mayonnaise",
    "1/4 cup grated Parmesan",
    "3 tablespoons fresh lemon juice",
    "1 tablespoon anchovy paste",
    "2 teaspoons Worcestershire sauce",
    "2 teaspoons Dijon mustard",
    "2 cloves garlic, minced"
  ],
  instructions: [
    "Whisk together all the dressing ingredients and set aside.",
    "Toss the chicken with 1 tablespoon olive oil and coat generously with the Cajun seasoning.",
    "Heat the remaining oil in a large skillet over medium-high heat. Sear the chicken until a deep crust forms on each side and it reaches 165°F internally. Rest a few minutes, then slice.",
    "Toss the romaine with croutons, Parmesan, and sliced chicken. Add the dressing just before serving and toss to coat."
  ]
},
{
  id: 63, title: "Classic Beef Chili", category: "soup",
  mealType: ["dinner"],
  cuisine: ["american"], mood: ["comfort"], seasonal: ["tomato"],
  time: "2 hrs 35 min", serves: "6-8",
  source: "Adapted from Katie Lee Biegel's \"Classic Easy Beef Chili,\" Food Network",
  ingredients: [
    "2 tablespoons olive oil",
    "1 yellow onion, chopped",
    "1 jalapeño, seeded and minced",
    "3 cloves garlic, minced",
    "2 lbs ground beef",
    "2 tablespoons chili powder",
    "1 tablespoon plus 1/2 teaspoon kosher salt",
    "1 teaspoon ground cumin",
    "1 teaspoon dried oregano",
    "1/2 teaspoon garlic powder",
    "1/2 teaspoon onion powder",
    "1/2 teaspoon black pepper",
    "1 bay leaf",
    "1 (5 oz) can tomato paste",
    "1 (28 oz) can diced tomatoes",
    "1 (16 oz) can kidney beans, drained and rinsed",
    "1 tablespoon white vinegar",
    "Sour cream, shredded cheddar, and sliced jalapeño, to serve"
  ],
  instructions: [
    "Heat the oil in a Dutch oven over medium-high heat. Sauté the onion until softened, about 5 minutes, then add the jalapeño and cook 1-2 minutes, followed by the garlic until fragrant.",
    "Add the beef and cook until browned and crumbled, 5-7 minutes. Stir in the chili powder, salt, cumin, oregano, garlic powder, onion powder, pepper, and bay leaf; cook a few minutes more.",
    "Stir in the tomato paste and cook 1-2 minutes, then add the diced tomatoes and 1 cup water. Bring to a simmer and cook, partially covered, 1 hour.",
    "Add the beans and simmer 1 more hour. Stir in the vinegar and adjust seasoning.",
    "Serve with sour cream, cheddar, and jalapeño."
  ]
},
{
  id: 64, title: "Easy Chicken Stir-Fry", category: "main",
  mealType: ["dinner"],
  cuisine: ["asian"], mood: ["healthy"], seasonal: [],
  time: "30 min", serves: "4",
  source: "Adapted from Simply Delicious' \"The Easiest Chicken Stir Fry\"",
  ingredients: [
    "1 lb chicken breast, cut into bite-size strips",
    "1 teaspoon baking soda (for tenderizing)",
    "2 cloves garlic, crushed",
    "1 teaspoon grated ginger",
    "1/4 cup soy sauce",
    "2 tablespoons rice vinegar",
    "1/4 cup hoisin sauce",
    "2 teaspoons lemon juice",
    "2 teaspoons honey",
    "1/2 teaspoon chili flakes",
    "2 teaspoons cornstarch",
    "2 green onions, chopped",
    "1 lb mixed stir-fry vegetables",
    "2 tablespoons oil, divided",
    "8 oz noodles (ramen or egg noodles), cooked",
    "Sesame seeds, for serving"
  ],
  instructions: [
    "Toss the chicken with the baking soda and let sit 15 minutes to tenderize, then rinse well and pat dry.",
    "Whisk together the garlic, ginger, soy sauce, rice vinegar, hoisin, lemon juice, honey, chili flakes, and cornstarch to make the sauce.",
    "Heat 1 tablespoon oil in a wok or large skillet over high heat. Cook the chicken in batches until golden on all sides; set aside.",
    "Add the remaining oil and stir-fry the vegetables a few minutes until crisp-tender.",
    "Return the chicken to the pan with the sauce and stir-fry 1 minute until glossy and thickened. Toss in the cooked noodles.",
    "Serve sprinkled with sesame seeds and green onions."
  ]
},
{
  id: 65, title: "Egg Fried Rice", category: "main",
  mealType: ["dinner"],
  cuisine: ["asian"], mood: ["comfort"], seasonal: ["peas"],
  time: "25 min", serves: "6",
  source: "Adapted from The Woks of Life",
  ingredients: [
    "5 cups cooked, cooled rice (day-old is best)",
    "5 large eggs, divided",
    "1/4 teaspoon paprika",
    "1/4 teaspoon turmeric",
    "3 tablespoons oil, divided",
    "1 medium onion, finely chopped",
    "1/2 red bell pepper, finely chopped",
    "1/2 cup frozen peas, thawed",
    "1 1/2 teaspoons salt",
    "1/4 teaspoon sugar",
    "1/4 teaspoon black pepper",
    "2 scallions, chopped"
  ],
  instructions: [
    "Fluff the cooled rice with a fork to separate the grains.",
    "Beat 3 of the eggs in one bowl. In another, beat the remaining 2 eggs with 2 tablespoons water, the paprika, and turmeric.",
    "Heat a wok over medium-high with 2 tablespoons oil. Scramble the plain eggs, then remove and set aside.",
    "Raise the heat to high, add the remaining oil, and stir-fry the onion and bell pepper 1-2 minutes.",
    "Add the rice and stir-fry 2 minutes, breaking up any clumps.",
    "Pour in the turmeric-egg mixture and stir-fry about 1 minute until the rice is evenly coated. Add the peas and stir-fry 1 more minute.",
    "Season with the salt, sugar, and pepper. Stir in the reserved scrambled eggs and scallions, and serve immediately."
  ]
},
{
  id: 66, title: "Fluffy Pancakes", category: "breakfast",
  mealType: ["breakfast"],
  cuisine: ["american"], mood: ["comfort"], seasonal: [],
  time: "25 min", serves: "4",
  source: "Adapted from Food Network Kitchen",
  ingredients: [
    "1 1/2 cups all-purpose flour",
    "3 tablespoons sugar",
    "1 tablespoon baking powder",
    "1/4 teaspoon salt",
    "1/8 teaspoon freshly grated nutmeg",
    "2 large eggs, room temperature",
    "1 1/4 cups milk, room temperature",
    "1/2 teaspoon vanilla extract",
    "3 tablespoons unsalted butter, melted, plus more for the pan"
  ],
  instructions: [
    "Whisk the flour, sugar, baking powder, salt, and nutmeg together in a large bowl.",
    "In another bowl, beat the eggs, then whisk in the milk, vanilla, and melted butter.",
    "Add the wet ingredients to the dry and whisk just until a thick batter forms — a few lumps are fine.",
    "Heat a griddle or skillet over medium heat and butter lightly. Ladle about 1/4 cup batter per pancake, spacing them apart.",
    "Cook until bubbles break the surface and the underside is golden, about 2 minutes, then flip and cook 1 minute more.",
    "Repeat with the remaining batter, buttering the pan as needed. Serve warm."
  ]
},
{
  id: 67, title: "Classic BLT Sandwich", category: "main",
  mealType: ["dinner"],
  cuisine: ["american"], mood: ["comfort"], seasonal: ["tomato"],
  time: "15 min", serves: "2",
  source: "Adapted from Simply Home Cooked",
  ingredients: [
    "4 slices rustic bread, toasted",
    "2 tablespoons mayonnaise",
    "2 tablespoons ranch dressing (optional, or use all mayonnaise)",
    "8 slices bacon, cooked crisp",
    "2 romaine lettuce leaves",
    "1-2 tomatoes, sliced",
    "Salt and pepper"
  ],
  instructions: [
    "Combine the mayonnaise and ranch (if using) and spread generously on one side of each slice of toast — coating both inner sides helps keep the bread from getting soggy.",
    "Layer the lettuce, bacon, and tomato slices on one piece of bread. Season the tomato lightly with salt and pepper.",
    "Top with the second slice of bread, cut in half, and serve immediately."
  ]
},
{
  id: 68, title: "Sheet-Pan Salmon with Vegetables", category: "main",
  mealType: ["dinner"],
  cuisine: ["american"], mood: ["healthy","fancy"], seasonal: ["tomato","lemon"],
  time: "1 hr 5 min", serves: "4",
  source: "Adapted from Food Network Kitchen's \"Sheet Pan Harissa Salmon and Vegetables\"",
  ingredients: [
    "1/4 cup olive oil",
    "3 tablespoons harissa paste (or substitute a mild chili paste)",
    "Juice of 2 lemons, plus 1 lemon sliced",
    "8 cloves garlic, minced",
    "1 tablespoon honey",
    "1 1/2 teaspoons dried oregano",
    "Kosher salt",
    "4 (6 oz) salmon fillets, skin on",
    "1 lb baby potatoes, halved",
    "1 red onion, sliced",
    "6-8 mini sweet bell peppers",
    "1 cup cherry tomatoes",
    "1/2 cup pitted green olives"
  ],
  instructions: [
    "Preheat oven to 400°F and oil a large sheet pan.",
    "Whisk together the olive oil, harissa, lemon juice, garlic, honey, oregano, and 2 teaspoons salt. Pat the salmon dry and brush with some of the marinade.",
    "Toss the potatoes with half the remaining marinade and spread on the pan. Roast about 20 minutes until crisp-tender.",
    "Toss the onion, bell peppers, tomatoes, and olives with the rest of the marinade. Push the potatoes aside, add the salmon skin-side down, top with lemon slices, and scatter the vegetables around it.",
    "Roast 25 minutes more, until the vegetables are tender and the salmon flakes easily. Broil 2-3 minutes at the end if you'd like the lemon slices charred."
  ]
},
{
  id: 69, title: "Traditional Greek Salad (Horiatiki)", category: "side",
  mealType: ["dinner"],
  cuisine: ["greek"], mood: ["healthy"], seasonal: ["tomato"],
  time: "15 min", serves: "6",
  source: "Adapted from The Mediterranean Dish",
  ingredients: [
    "1 medium red onion, thinly sliced",
    "4 medium ripe tomatoes, cut into wedges",
    "1 English cucumber, sliced into half-moons",
    "1 green bell pepper, cored and sliced into rings",
    "A handful of pitted Kalamata olives",
    "1 1/2 teaspoons dried oregano, divided",
    "Kosher salt",
    "1/4 cup extra-virgin olive oil",
    "1-2 tablespoons red wine vinegar",
    "1 (7 oz) block Greek feta, torn into slabs"
  ],
  instructions: [
    "Optional: soak the sliced onion in ice water with a splash of red wine vinegar for 10 minutes to mellow its bite, then drain.",
    "Combine the tomatoes, cucumber, bell pepper, olives, and onion in a large serving dish.",
    "Sprinkle with half the oregano and a pinch of salt. Add the olive oil and vinegar to taste, and toss gently.",
    "Top with the feta slabs and sprinkle with the remaining oregano before serving."
  ]
}

];
