import type {Page} from '@playwright/test';
/** Operate the actual settings dialog; never force actions on hidden controls. */
export async function selectSetting(page:Page,id:string,value:string){
 const opened=await page.locator('#more-settings').isVisible();if(!opened)await page.locator('#more-open').click();
 await page.locator(id).selectOption(value);if(!opened)await page.locator('#more-close').click();
}
