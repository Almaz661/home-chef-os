import urllib.request, re, json

url = "https://menunedeli.ru/recipe/lenivye-golubcy/"
req = urllib.request.Request(url, headers={
    "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    "Accept-Language": "ru-RU,ru;q=0.9",
})
try:
    with urllib.request.urlopen(req, timeout=15) as resp:
        html = resp.read().decode("utf-8", errors="replace")
except Exception as e:
    print(f"Error: {e}")
    html = ""

# Find og:image
og = re.findall(r'content="(https://[^"]+(?:jpg|jpeg|png|webp)[^"]*)"', html)
print("Possible images:", og[:5])

# Find JSON-LD
jlds = re.findall(r'<script[^>]*application/ld\+json[^>]*>(.*?)</script>', html, re.DOTALL)
for jld in jlds:
    try:
        d = json.loads(jld)
        if isinstance(d, dict) and d.get("@type") == "Recipe":
            print("Schema.org image:", d.get("image"))
    except:
        pass
