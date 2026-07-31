const puppeteer = require('puppeteer');
const fs = require('fs');

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  
  await page.goto('https://www.haveanothercherry.com/');
  
  // Wait for password input and type password
  await page.waitForSelector('.password-input', { timeout: 10000 });
  await page.type('.password-input', '02o304o5');
  await page.click('button[type="submit"]');
  
  // Wait for navigation
  await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 20000 });
  
  // Extract colors from styles
  const themeData = await page.evaluate(() => {
    const styles = Array.from(document.styleSheets);
    let allText = '';
    
    // Also get computed styles of body and major elements
    const bodyStyles = window.getComputedStyle(document.body);
    const headings = window.getComputedStyle(document.querySelector('h1') || document.body);
    const buttons = window.getComputedStyle(document.querySelector('button') || document.body);
    const links = window.getComputedStyle(document.querySelector('a') || document.body);
    const primary = document.querySelector('.sqs-block-button-element') || document.querySelector('.button');
    const primaryStyles = primary ? window.getComputedStyle(primary) : null;
    
    return {
      bodyBg: bodyStyles.backgroundColor,
      bodyColor: bodyStyles.color,
      bodyFont: bodyStyles.fontFamily,
      h1Color: headings.color,
      h1Font: headings.fontFamily,
      buttonBg: buttons.backgroundColor,
      buttonColor: buttons.color,
      linkColor: links.color,
      primaryBtnBg: primaryStyles ? primaryStyles.backgroundColor : null,
      primaryBtnColor: primaryStyles ? primaryStyles.color : null,
      primaryBtnFont: primaryStyles ? primaryStyles.fontFamily : null,
      htmlContent: document.body.innerHTML.substring(0, 5000)
    };
  });
  
  console.log(JSON.stringify(themeData, null, 2));
  
  await browser.close();
})();
