import os
import torch
from diffusers import StableDiffusionPipeline
from PIL import Image

checkpoint_path = r"D:\Users\ComfyUI\models\checkpoints\v1-5-pruned-emaonly.safetensors"
output_dir = r"D:\Users\language_projects\typescript_projects\ai-philosophy-reel\assets_2min"
os.makedirs(output_dir, exist_ok=True)

print("[1/3] Loading SD 1.5 pipeline on RTX 5050...")
pipe = StableDiffusionPipeline.from_single_file(
    checkpoint_path,
    torch_dtype=torch.float16,
    use_safetensors=True
)
pipe.to("cuda")
pipe.enable_attention_slicing()

base_positive = (
    "masterpiece, highest quality, classical oil painting, rembrandt lighting, chiaroscuro, "
    "17th century academic art, ancient greek neoclassical aesthetic, richly detailed textures, canvas grain, dramatic cinematic lighting"
)

base_negative = (
    "modern elements, anime, 3d render, cartoon, digital art, oversaturated, deformed hands, bad anatomy, text, watermark, blurry, low quality"
)

scenes = [
    {
        "id": "scene_1",
        "prompt": f"{base_positive}, deep underground cavern, chained prisoners trapped in cave darkness, ancient iron shackles, cold damp stone wall, dark gloomy shadows, distant faint torchlight, philosophical epic",
        "seed": 101
    },
    {
        "id": "scene_2",
        "prompt": f"{base_positive}, burning fire on raised ledge in ancient cave, warm glowing orange flame, people carrying wooden puppets and statues behind low wall, dramatic cast shadows dancing on limestone wall, chiaroscuro",
        "seed": 202
    },
    {
        "id": "scene_3",
        "prompt": f"{base_positive}, prisoners in cave gazing at giant silhouette shadows on wall, whispering shadows, illusion of reality, dim candle and torch light, ancient greek robes, atmospheric smoke",
        "seed": 303
    },
    {
        "id": "scene_4",
        "prompt": f"{base_positive}, close up broken iron chains falling to ground, one prisoner turning his head around towards blazing fire, shield eyes from blinding torch flame, dramatic expression, shock and pain of illumination",
        "seed": 404
    },
    {
        "id": "scene_5",
        "prompt": f"{base_positive}, steep rocky rough stone ascent tunnel climbing upwards, a lone man climbing steep jagged rocks, bright white golden sunlight bursting through cave entrance opening at top, epic perspective",
        "seed": 505
    },
    {
        "id": "scene_6",
        "prompt": f"{base_positive}, clear mountain stream water reflection outside cave, man kneeling by pond looking at reflection of sky and starry night cosmos, ancient olive trees, soft twilight atmosphere",
        "seed": 606
    },
    {
        "id": "scene_7",
        "prompt": f"{base_positive}, magnificent radiant golden sun in clear sky, ancient Athens acropolis temple on hill, greek columns, olive grove, pure divine sunlight illuminating the earth, truth and the Good",
        "seed": 707
    },
    {
        "id": "scene_8",
        "prompt": f"{base_positive}, philosopher returning down into dark gloomy cave, halo of celestial outdoor light around him, cave dwellers sitting in darkness looking up in skepticism, deep philosophical mystery",
        "seed": 808
    }
]

print("[2/3] Generating 8 vertical scenes (576x1024 base -> upscaled to 1080x1920)...")
for i, sc in enumerate(scenes, 1):
    out_file = os.path.join(output_dir, f"{sc['id']}.jpg")
    if os.path.exists(out_file):
        print(f"Skipping {sc['id']} (already exists)")
        continue

    print(f"Rendering [{i}/8]: {sc['id']}...")
    generator = torch.Generator(device="cuda").manual_seed(sc["seed"])

    # 576x1024 保持标准 9:16，SD 1.5 原生最优画质区间
    image = pipe(
        prompt=sc["prompt"],
        negative_prompt=base_negative,
        width=576,
        height=1024,
        num_inference_steps=28,
        guidance_scale=7.5,
        generator=generator
    ).images[0]

    # Lanczos 高保真重采样至 1080x1920 竖屏
    image_1080 = image.resize((1080, 1920), Image.Resampling.LANCZOS)
    image_1080.save(out_file, quality=95)
    print(f"Saved: {out_file}")

print("[3/3] All 8 scenes successfully generated!")
