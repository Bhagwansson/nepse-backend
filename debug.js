const puppeteer = require("puppeteer");

(async () => {
  console.log("🕵️‍♂️ Launching Spy Browser...");
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    args: ["--start-maximized"],
  });
  const page = await browser.newPage();

  // Go to the target page
  await page.goto("https://www.sharesansar.com/today-share-price", {
    waitUntil: "domcontentloaded",
  });

  console.log("⏳ Analyzing page structure...");

  // SPY LOGIC: Find all inputs and print their IDs and Classes
  const inputs = await page.evaluate(() => {
    const inputElements = Array.from(document.querySelectorAll("input"));
    return inputElements.map((el) => ({
      id: el.id,
      name: el.name,
      placeholder: el.placeholder,
      type: el.type,
      isVisible: el.offsetParent !== null, // Checks if it's actually visible on screen
    }));
  });

  console.log("\n---------------- FOUND INPUTS ----------------");
  console.table(inputs); // Prints a nice table of all inputs
  console.log("----------------------------------------------\n");

  // Also look for buttons (to see if we need to click "Filter" first)
  const buttons = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("button"));
    return btns.map((b) => ({
      text: b.innerText.trim(),
      id: b.id,
      class: b.className,
    }));
  });

  console.log("---------------- FOUND BUTTONS ----------------");
  // Print first 5 buttons just to see
  console.log(buttons.slice(0, 10));
  console.log("-----------------------------------------------\n");

  // Keep browser open for you to inspect manually if needed
  console.log(
    "👀 Browser is open. You can right-click the date box and 'Inspect' it yourself."
  );
})();
