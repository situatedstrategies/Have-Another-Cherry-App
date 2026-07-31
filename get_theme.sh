#!/bin/bash
# Get the crumb
curl -c cookies.txt -s -i https://haveanothercherry.com/ > headers.txt
CRUMB=$(grep crumb cookies.txt | awk '{print $7}')

# POST the password
curl -L -c cookies.txt -b cookies.txt -s -i -X POST https://haveanothercherry.com/api/auth/VerifyPassword -H "Content-Type: application/json" -H "X-Csrf-Token: $CRUMB" -d '{"password":"02o304o5"}' > post_res.txt

# Get the page
curl -L -b cookies.txt -s https://haveanothercherry.com/ > theme.html

# Get CSS files
grep -o 'href="[^"]*\.css[^"]*"' theme.html | cut -d'"' -f2 > css_links.txt
cat css_links.txt
