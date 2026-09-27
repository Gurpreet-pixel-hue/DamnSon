import bpy
import glob
import math
import os
import shutil

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
ART_OUT = os.path.join(PROJECT_ROOT, "art", "out")
REVIEW_DIR = os.path.join(PROJECT_ROOT, "art", "out", "review")
EXTRA_DIR = os.environ.get("REVIEW_EXTRA_DIR")
os.makedirs(ART_OUT, exist_ok=True)
os.makedirs(REVIEW_DIR, exist_ok=True)

PACKS = [
    ("commercial", os.path.join(PROJECT_ROOT, "art", "src", "kenney-city-kit-commercial")),
    ("suburban", os.path.join(PROJECT_ROOT, "art", "src", "kenney-city-kit-suburban")),
    ("industrial", os.path.join(PROJECT_ROOT, "art", "src", "kenney-city-kit-industrial")),
]

def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = 'BLENDER_EEVEE_NEXT' if hasattr(bpy.types, 'RenderSettings') and 'BLENDER_EEVEE_NEXT' in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items] else 'BLENDER_EEVEE'
    scene.render.resolution_x = 3200
    scene.render.resolution_y = 2000
    scene.render.resolution_percentage = 100
    scene.view_settings.view_transform = 'Standard'

    # World background with ambient at 0.6 per E10
    if not scene.world:
        scene.world = bpy.data.worlds.new("World")
    scene.world.use_nodes = True
    bg_node = scene.world.node_tree.nodes.get("Background")
    if bg_node:
        bg_node.inputs[0].default_value = (0.95, 0.93, 0.90, 1.0)
        bg_node.inputs[1].default_value = 0.6

def setup_lighting_and_camera(min_x, max_x, min_y, max_y):
    center_x = (min_x + max_x) / 2.0
    center_y = (min_y + max_y) / 2.0

    target_empty = bpy.data.objects.new("CamTarget", None)
    bpy.context.collection.objects.link(target_empty)
    target_empty.location = (center_x, center_y, 0)

    # Sun light from (-1, 2, 1.5) per E10
    light_data = bpy.data.lights.new(name="Sun", type='SUN')
    light_data.energy = 2.4
    light_data.color = (1.0, 0.98, 0.95)
    light_obj = bpy.data.objects.new(name="Sun", object_data=light_data)
    bpy.context.collection.objects.link(light_obj)
    # Position sun along (-1, 2, 1.5) direction from target center
    light_obj.location = (center_x - 50.0, center_y + 100.0, 75.0)

    track_sun = light_obj.constraints.new(type='TRACK_TO')
    track_sun.target = target_empty
    track_sun.track_axis = 'TRACK_NEGATIVE_Z'
    track_sun.up_axis = 'UP_Y'

    # Orthographic camera
    cam_data = bpy.data.cameras.new(name="Camera")
    cam_data.type = 'ORTHO'
    cam_data.clip_start = 0.1
    cam_data.clip_end = 500.0

    center_x = (min_x + max_x) / 2.0
    center_y = (min_y + max_y) / 2.0
    span_x = (max_x - min_x) + 8.0
    span_y = (max_y - min_y) + 8.0
    cam_data.ortho_scale = max(span_x, span_y * (3200 / 2000)) * 1.15

    cam_obj = bpy.data.objects.new(name="Camera", object_data=cam_data)
    bpy.context.collection.objects.link(cam_obj)
    bpy.context.scene.camera = cam_obj

    # Position camera isometric looking at center
    dist = 80.0
    pitch = math.radians(55)
    yaw = math.radians(-35)
    cam_obj.location = (
        center_x + dist * math.sin(yaw) * math.cos(pitch),
        center_y - dist * math.cos(yaw) * math.cos(pitch),
        dist * math.sin(pitch),
    )

    # Track to target empty at center
    target_empty = bpy.data.objects.new("CamTarget", None)
    bpy.context.collection.objects.link(target_empty)
    target_empty.location = (center_x, center_y, 0)

    track = cam_obj.constraints.new(type='TRACK_TO')
    track.target = target_empty
    track.track_axis = 'TRACK_NEGATIVE_Z'
    track.up_axis = 'UP_Y'

def render_contact_sheet(pack_name, folder_path):
    reset_scene()
    glbs = sorted(glob.glob(os.path.join(folder_path, "*.glb")))
    if not glbs:
        print(f"No GLBs found in {folder_path}")
        return

    cols = 7
    spacing_x = 5.0
    spacing_y = 5.5

    # Text material (dark charcoal text)
    text_mat = bpy.data.materials.new(name="TextMat")
    text_mat.use_nodes = True
    bsdf = text_mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs[0].default_value = (0.11, 0.10, 0.09, 1.0) # #1D1A16

    min_x, max_x = 0.0, (cols - 1) * spacing_x
    max_rows = math.ceil(len(glbs) / cols)
    min_y, max_y = -(max_rows - 1) * spacing_y, 0.0

    for idx, glb_path in enumerate(glbs):
        col = idx % cols
        row = idx // cols
        gx = col * spacing_x
        gy = -row * spacing_y

        # Import GLB
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=glb_path)
        imported = set(bpy.data.objects) - before

        for obj in imported:
            if obj.parent is None:
                obj.location.x += gx
                obj.location.y += gy

        # Add label
        base_name = os.path.splitext(os.path.basename(glb_path))[0]
        curve = bpy.data.curves.new(type="FONT", name=f"Label_{base_name}")
        curve.body = base_name
        curve.size = 0.65
        curve.extrude = 0.03
        curve.align_x = 'CENTER'
        curve.align_y = 'TOP'

        txt_obj = bpy.data.objects.new(name=f"Text_{base_name}", object_data=curve)
        txt_obj.location = (gx, gy - 2.2, 0.02)
        txt_obj.rotation_euler = (math.radians(35), 0, 0) # Face isometric camera
        txt_obj.active_material = text_mat
        bpy.context.collection.objects.link(txt_obj)

    center_x = (min_x + max_x) / 2.0
    center_y = (min_y + max_y) / 2.0

    # Ground plane for shadows
    bpy.ops.mesh.primitive_plane_add(size=300, location=(center_x, center_y, -0.01))
    ground = bpy.context.active_object
    ground_mat = bpy.data.materials.new(name="GroundMat")
    g_bsdf = ground_mat.node_tree.nodes.get("Principled BSDF")
    if g_bsdf:
        g_bsdf.inputs[0].default_value = (0.96, 0.94, 0.89, 1.0) # #F5EFE3
    ground.active_material = ground_mat

    setup_lighting_and_camera(min_x, max_x, min_y, max_y)

    out_path = os.path.join(ART_OUT, f"contact-{pack_name}.png")
    bpy.context.scene.render.filepath = out_path
    print(f"Rendering contact sheet to {out_path}...")
    bpy.ops.render.render(write_still=True)

    review_path = os.path.join(REVIEW_DIR, f"contact-{pack_name}.png")
    shutil.copyfile(out_path, review_path)
    if EXTRA_DIR and os.path.exists(EXTRA_DIR):
        artifact_path = os.path.join(EXTRA_DIR, f"contact-{pack_name}.png")
        shutil.copyfile(out_path, artifact_path)
    print(f"✓ Saved {out_path} and copied to {review_path}")

def main():
    for name, folder in PACKS:
        print(f"\n=== Processing Pack: {name} ===")
        render_contact_sheet(name, folder)

if __name__ == "__main__":
    main()
