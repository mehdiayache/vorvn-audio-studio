#!/usr/bin/env python3
"""
Turn Alibaba's official base-voice spreadsheets into ui/voices.json.

The spreadsheets are published only in Chinese, so this translates the metadata
(gender, language, character, use case) into English for the voice browser.

Re-run after downloading fresh copies:
    curl -sL -o plus.xlsx  "<plus xlsx url from the voice list docs>"
    curl -sL -o flash.xlsx "<flash xlsx url>"
    .venv/bin/python build_voices.py plus.xlsx flash.xlsx
"""

import json
import re
import sys
from pathlib import Path

import openpyxl

OUT = Path(__file__).parent / "ui" / "voices.json"

GENDER = {"女": "female", "男": "male"}
LANGUAGE = {"中文": "Chinese", "英文": "English"}

SCENE = {
    "日常对话": "everyday conversation", "情感陪伴": "companionship",
    "有声阅读": "audiobook", "社交互动": "social", "动漫配音": "anime dubbing",
    "新闻播报": "news", "电商直播": "shopping livestream",
    "古风有声书": "historical audiobook", "体育解说": "sports commentary",
    "有声书配音": "audiobook narration", "深夜电台": "late-night radio",
    "知识分享": "explainer", "智能客服": "customer service",
    "娱乐搞笑": "comedy", "标准通用型客服": "customer service",
    "商务汇报": "business presentation", "智能助手": "assistant",
    "演讲朗诵": "speech and recital", "初期催收提醒客服": "payment reminder",
    "讲解引导型客服": "guided support", "理财咨询型客服": "financial advice",
    "引导新手型客服": "onboarding support", "账单提醒型客服": "billing reminder",
    "新品推荐型客服": "product recommendation", "理财顾问型客服": "financial advisor",
    "医院社区引导型客服": "healthcare guidance", "监察回访型客服": "follow-up call",
    "核保理赔型客服": "insurance claims",
}

# Character traits are compound words built from a small set of morphemes, so
# translating token-by-token covers all 179 of them without a 179-entry table.
TRAIT_TOKENS = {
    "温柔": "gentle", "亲和": "warm", "中气": "full-bodied", "充沛": "resonant",
    "客观": "objective", "冷静": "calm", "贴心": "caring", "活泼": "lively",
    "灵动": "animated", "知性": "intellectual", "温婉": "graceful",
    "成熟": "mature", "标准": "standard", "播音": "broadcast", "爽朗": "hearty",
    "利落": "crisp", "自然": "natural", "智能": "smart", "助手": "assistant",
    "叙事": "narrative", "沉浸": "immersive", "温润": "mellow",
    "磁性": "magnetic", "电台": "radio", "质感": "textured", "坚韧": "resilient",
    "细腻": "delicate", "惊恐": "fearful", "不安": "uneasy", "直播": "livestream",
    "带货": "sales", "清亮": "bright", "明朗": "clear", "平稳": "steady",
    "陈述": "matter-of-fact", "呆萌": "goofy", "软糯": "soft", "激动": "excited",
    "振奋": "rousing", "撒娇": "coquettish", "甜蜜": "sweet", "甜萌": "sweet",
    "可爱": "cute", "青春": "youthful", "朝气": "energetic", "沉稳": "composed",
    "大气": "dignified", "慵懒": "languid", "童趣": "childlike",
    "知心": "confiding", "温甜": "sweet", "柔美": "graceful", "不满": "discontented",
    "犀利": "sharp", "讲解": "explanatory", "温稳": "calm", "沉着": "steady",
    "浑厚": "rich", "二次元": "anime", "活力": "energetic", "亲切": "friendly",
    "客服": "service", "角色": "character", "模仿": "impression",
    "暖男": "warm", "雍容": "stately", "宫廷": "courtly", "大方": "poised",
    "温和": "mild", "清朗": "clear", "少年": "youthful", "专业": "professional",
    "解说": "commentary", "娇嗲": "kittenish", "甜腻": "saccharine",
    "搞怪": "wacky", "逗趣": "funny", "天真": "innocent", "邻家": "girl-next-door",
    "御姐": "commanding", "惊奇": "astonished", "讶异": "surprised",
    "轻松": "relaxed", "闲聊": "chatty", "戏腔": "operatic", "傲娇": "tsundere",
    "俏皮": "playful", "伤感": "sorrowful", "低回": "wistful", "铿锵": "forceful",
    "有力": "strong", "自信": "confident", "从容": "assured", "侠骨": "chivalrous",
    "柔情": "tender", "阴狠": "sinister", "毒辣": "vicious", "复古": "retro",
    "磁带": "tape", "电子": "electronic", "潮流": "trendy", "新闻": "news",
    "严肃": "serious", "低沉": "deep", "高亢": "soaring", "沙哑": "husky",
    "干净": "clean", "阳光": "sunny", "霸气": "commanding", "慈祥": "kindly",
    "疲惫": "weary", "冷漠": "aloof", "神秘": "mysterious", "优雅": "elegant",
    "率真": "candid", "稳重": "steady", "干练": "capable", "文艺": "literary",
    "古风": "classical", "现代": "modern", "威严": "authoritative",
    "热情": "enthusiastic", "冷酷": "cold", "调皮": "mischievous",
    "娇羞": "bashful", "空灵": "ethereal", "厚重": "weighty", "轻快": "brisk",
    # second pass — everything the first run left in Chinese
    "善解人意": "considerate", "循循善诱": "patiently guiding",
    "憨厚": "genial", "诙谐": "humorous", "柔弱": "frail", "楚楚": "delicate",
    "柔怯": "timid", "少女": "girlish", "热血": "hot-blooded", "激昂": "impassioned",
    "姐姐": "big-sister", "内敛": "reserved", "含蓄": "understated",
    "鼓舞": "inspiring", "激励": "motivating", "委屈": "aggrieved",
    "哀怨": "plaintive", "耐心": "patient", "动漫": "anime", "风格": "style",
    "不屑": "disdainful", "倨傲": "haughty", "欢乐": "joyful", "好奇": "curious",
    "忧郁": "melancholy", "深沉": "deep", "元气": "spirited", "憨萌": "endearing",
    "压抑": "subdued", "侠气": "heroic", "武侠": "wuxia", "怯弱": "timid",
    "自卑": "insecure", "将领": "commander", "卡通": "cartoon", "教导": "teaching",
    "理性": "rational", "告知": "informative", "平实": "plain", "质朴": "unadorned",
    "直爽": "forthright", "紧张": "tense", "惊悚": "chilling", "恐怖": "horror",
    "亢奋": "fired-up", "朗诵": "recitation", "科普": "science", "愤懑": "indignant",
    "不平": "aggrieved", "急躁": "impatient", "焦灼": "anxious", "激情": "passionate",
    "澎湃": "surging", "聊天": "chatty", "笃定": "certain", "联播": "newscast",
    "期待": "expectant", "向往": "yearning", "刻薄": "caustic", "鼓励": "encouraging",
    "认可": "affirming", "谆谆": "earnest", "劝导": "persuasive", "惋惜": "regretful",
    "叹惋": "rueful", "愉悦": "pleasant", "麻利": "nimble", "忧伤": "sorrowful",
    "沮丧": "dejected", "低落": "downcast", "温雅": "refined", "端庄": "dignified",
    "不耐": "impatient", "烦躁": "irritable", "惊喜": "delighted", "意外": "surprised",
    "老练": "seasoned", "机灵": "quick-witted", "心机": "scheming", "绿茶": "saccharine",
    "欢快": "cheerful", "领导": "leaderly", "阴郁": "gloomy", "强势": "forceful",
    "沉郁": "brooding", "心事": "troubled", "术士": "sorcerer", "憨直": "blunt",
    "正气": "righteous", "凛然": "stern", "清俊": "fresh-faced", "纯真": "pure",
    "稚嫩": "childlike", "鬼马": "impish", "指挥": "commanding", "闺秀": "genteel",
    "硬朗": "rugged", "阳刚": "masculine", "开朗": "outgoing", "热忱": "earnest",
    "推荐": "recommending", "哀婉": "mournful", "大笑": "laughing",
    "祖母": "grandmotherly", "游戏": "gaming", "运动": "workout", "喘息": "breathy",
    "焦躁": "agitated", "烦闷": "vexed", "凌厉": "fierce", "剑气": "blade",
    "智慧": "wise", "随性": "easygoing", "自在": "free-spirited", "文雅": "refined",
    "书卷": "scholarly", "腹黑": "devious", "萌宠": "pet", "拟声": "mimicry",
    "正太": "boyish", "变声": "pitched", "司仪": "emcee", "睿智": "sagacious",
    "青年": "young", "尖亮": "piercing", "穿透": "penetrating", "深邃": "profound",
    "播报": "anchor", "稳健": "steady", "顾问": "advisory", "启蒙": "introductory",
    "导师": "mentoring", "真诚": "sincere", "邀请": "inviting", "诚恳": "earnest",
    "响应": "responsive", "包容": "accommodating", "克制": "restrained",
    "礼貌": "polite",
}


def translate_trait(raw: str) -> str:
    """Split a compound trait into known morphemes; keep anything unrecognised."""
    if not raw:
        return ""
    text = re.sub(r"音$", "", raw)  # every trait ends in 音 ("voice")
    words, i = [], 0
    while i < len(text):
        for size in (4, 3, 2):  # longest match first, so idioms beat their parts
            token = text[i:i + size]
            if token in TRAIT_TOKENS:
                words.append(TRAIT_TOKENS[token])
                i += size
                break
        else:
            words.append(text[i])  # untranslated character, passed through
            i += 1
    return " ".join(dict.fromkeys(words))  # de-dupe e.g. "sweet sweet"


SAMPLES = Path(__file__).parent / "ui" / "samples"


def parse(path: Path, tier: str) -> list[dict]:
    rows = list(openpyxl.load_workbook(path).active.iter_rows(values_only=True))[1:]
    voices = []
    for row in rows:
        _, name, voice_id, gender, age, trait, scene, language, preview = row[:9]
        if not voice_id:
            continue
        # The preview pack ships .wav; we transcode to .mp3 to keep it small.
        sample = Path(preview or "").stem
        voices.append({
            "id": voice_id,
            "tier": tier,
            "name": name,
            "gender": GENDER.get(gender, "unspecified"),
            "age": age,
            "trait": translate_trait(trait),
            "trait_zh": trait,
            "scene": SCENE.get(scene, scene),
            "language": LANGUAGE.get(language, language),
            # Only claim a sample when the file is actually on disk, so the UI
            # never offers a play button that 404s.
            "sample": f"{sample}.mp3" if (SAMPLES / f"{sample}.mp3").exists() else None,
        })
    return voices


def main() -> int:
    if len(sys.argv) != 3:
        print(__doc__)
        return 1
    voices = parse(Path(sys.argv[1]), "plus") + parse(Path(sys.argv[2]), "flash")
    OUT.write_text(json.dumps(voices, ensure_ascii=False, indent=0))

    english = sum(1 for v in voices if v["language"] == "English")
    sampled = sum(1 for v in voices if v["sample"])
    print(f"{len(voices)} voices -> {OUT}")
    print(f"  plus: {sum(1 for v in voices if v['tier'] == 'plus')}"
          f"  flash: {sum(1 for v in voices if v['tier'] == 'flash')}")
    print(f"  English-language: {english}   Chinese-language: {len(voices) - english}")
    print(f"  with a playable sample: {sampled}   missing: {len(voices) - sampled}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
