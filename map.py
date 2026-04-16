import json

with open("data.json", "r", encoding="utf-8") as f:
    data = json.load(f)

def map_tag(tag):
    t = tag.lower()

    if t in ["computer film", "motion", "animation"]:
        return "computer film"
    if t == "video":
        return "video"
    if t in ["sound", "saound"]:
        return "sound"
    if t == "installation":
        return "installation"
    if t == "performance":
        return "performance"
    if t == "interactive":
        return "interactive"
    if t == "network":
        return "network"
    if t == "robotics":
        return "robotics"
    if t == "3d":
        return "3D"
    if t == "virtual":
        return "virtual reality"
    if t in ["simulation", "perception"]:
        return "simulation"
    if t == "ai":
        return "AI"

    return "digital image"

def clean_tags(tags):
    mapped = [map_tag(t) for t in tags]
    unique = list(dict.fromkeys(mapped))  # removes duplicates
    return unique[:3]

for item in data:
    item["tags"] = clean_tags(item.get("tags", []))

with open("cleaned.json", "w", encoding="utf-8") as f:
    json.dump(data, f, indent=2, ensure_ascii=False)

print("Done → cleaned.json created")