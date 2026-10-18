import { expect, test } from "@playwright/test";

test("clicking anywhere on a practice drop card opens its event details", async ({ page }) => {
 await page.goto("/arena");
 const card=page.locator(".event-card-link").filter({hasText:"Stadium Opening Night"});
 await expect(card).toHaveAttribute("href","/events/stadium-opening");
 await expect(card.locator("a")).toHaveCount(0);
 await card.locator(".event-card").click({position:{x:18,y:180}});
 await expect(page).toHaveURL(/\/events\/stadium-opening$/);
 await expect(page.getByRole("button",{name:/Join the queue/})).toBeVisible();
});

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
 const available=page.getByRole("button",{name:/AVAILABLE/}).first();
 const firstSeat=await available.getAttribute("aria-label");
 expect(firstSeat).toMatch(/AVAILABLE$/);
 await available.click();
 await expect(page.getByRole("button",{name:firstSeat!.replace("AVAILABLE","HELD")})).toBeEnabled();
 const claimsBefore=await page.locator(".seat-map-heading .eyebrow").innerText();
 await page.waitForTimeout(1_700);
 await expect(page.locator(".seat-map-heading .eyebrow")).not.toHaveText(claimsBefore);
 await expect(page.getByRole("button",{name:firstSeat!.replace("AVAILABLE","HELD")})).toHaveAttribute("aria-pressed","true");
 const heldSeats=[firstSeat!.replace("AVAILABLE","HELD")];
 for(let index=1;index<4;index+=1){
  const next=page.getByRole("button",{name:/AVAILABLE/}).first();
  const label=await next.getAttribute("aria-label");
  expect(label).toMatch(/AVAILABLE$/);
  await next.click();
  const heldLabel=label!.replace("AVAILABLE","HELD");
  await expect(page.getByRole("button",{name:heldLabel})).toHaveAttribute("aria-pressed","true");
  heldSeats.push(heldLabel);
 }
 for(const label of heldSeats) await expect(page.getByRole("button",{name:label})).toHaveAttribute("aria-pressed","true");
 await page.getByRole("button",{name:/Continue with 4 seats/}).click();
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

test("hard queue admits the player to the seat map",async({page})=>{
 await page.goto("/arena");
 await page.getByRole("link",{name:"Stadium Opening Night"}).click();
 await page.getByLabel("HARD").check();
 await page.getByRole("button",{name:/Join the queue/}).click();
 await expect(page.getByRole("heading",{name:/Choose up to four seats/})).toBeVisible({timeout:12_000});
 await expect(page.getByRole("button",{name:/AVAILABLE/}).first()).toBeEnabled();
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
