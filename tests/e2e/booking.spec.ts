import { expect, test } from "@playwright/test";

test("anonymous player queues, selects seats, mocks payment, and sees result", async ({page}) => {
 await page.goto("/");
 await expect(page.getByRole("link",{name:/Create account|Sign in/})).toHaveCount(0);
 await page.getByRole("link",{name:/Explore practice drops/}).click();
 await page.getByRole("link",{name:"Stadium Opening Night"}).click();
 await page.getByLabel("EASY",{exact:false}).check();
 await page.getByRole("button",{name:/Join the queue/}).click();
 await expect(page.getByRole("heading",{name:"Stadium Opening Night"})).toBeVisible();
 await expect(page.getByText(/Queue position/)).toBeVisible();
 await expect(page.getByRole("heading",{name:/Choose up to four seats/})).toBeVisible({timeout:15_000});
 const viewport=page.viewportSize()?.width??0;
 expect(await page.locator("body").evaluate(el=>el.scrollWidth)).toBeLessThanOrEqual(viewport+2);
 const available=page.getByRole("button",{name:/FL-A\d+ AVAILABLE/}).first();
 await available.click();
 await page.getByRole("button",{name:/Hold 1 seat/}).click();
 await expect(page.getByText("Visa ···· 4242")).toBeVisible();
 await expect(page.getByRole("button",{name:"Pay Now"})).toBeVisible();
 await page.getByRole("button",{name:"Pay Now"}).click();
 await expect(page).toHaveURL(/\/results\/[0-9a-f-]+$/);
 await expect(page.getByRole("heading",{name:"You got the seats."})).toBeVisible();
 await expect(page.getByText("Total time")).toBeVisible();
 await expect(page.getByText("Session best!")).toBeVisible();
 await page.getByRole("button",{name:"Retry this drop"}).click();
 await expect(page).toHaveURL(/\/practice\/booking\/[0-9a-f-]+$/);
 await page.getByRole("link",{name:/Drop details/}).click();
 await expect(page.getByText(/Your best this page session:/)).toBeVisible();
});

test("hard queue can sell out before admission and the retry gets a fresh run",async({page})=>{
 await page.goto("/arena");
 await page.getByRole("link",{name:"Stadium Opening Night"}).click();
 await page.getByLabel("HARD").check();
 await page.getByRole("button",{name:/Join the queue/}).click();
 await expect(page).toHaveURL(/\/results\/[0-9a-f-]+$/, {timeout:20_000});
 await expect(page.getByRole("heading",{name:"The rush got away."})).toBeVisible();
 await expect(page.getByText(/Virtual inventory was exhausted/)).toBeVisible();
 const firstRun=page.url().split("/").at(-1);
 await page.getByRole("button",{name:"Retry this drop"}).click();
 await expect(page).toHaveURL(/\/practice\/booking\/[0-9a-f-]+$/);
 expect(page.url().split("/").at(-1)).not.toBe(firstRun);
});

test("arena and seat map fit the selected viewport",async({page},testInfo)=>{
 await page.goto("/arena");
 await expect(page.getByRole("heading",{name:/Choose your next drop/})).toBeVisible();
 await page.getByRole("link",{name:"Stadium Opening Night"}).click();
 await page.getByRole("button",{name:/Join the queue/}).click();
 await expect(page.getByText(/Queue position/)).toBeVisible();
 const width=await page.locator("body").evaluate(el=>el.scrollWidth);
 const viewport=page.viewportSize()?.width??0;
 expect(width).toBeLessThanOrEqual(viewport+2);
 if(testInfo.project.name==="mobile-chromium") await expect(page.getByRole("heading",{name:/Queue position/})).toBeVisible();
});
