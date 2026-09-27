import bpy
import math
import os
import shutil

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT_DIR = os.path.join(PROJECT_ROOT, ".next", "claude-review", "fe-3.5")
os.makedirs(OUT_DIR, exist_ok=True)

STATIONS_GLB = os.path.join(PROJECT_ROOT, "art", "out", "stations.glb")

STATION_ORDER = [
    "municipal_hq",
    "ward_office",
    "revenue_office",
    "labour_department",
    "fire_services",
    "police",
    "health_department",
    "utility_provider",
    "pollution_control_board",
    "court_or_notary",
    "other",
    "milestone",
    "online_portal",
]

def render():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = 'BLENDER_EEVEE_NEXT' if hasattr(bpy.types, 'RenderSettings') and 'BLENDER_EEVEE_NEXT' in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items] else 'BLENDER_EEVEE'
    scene.render.resolution_x = 3200
    scene.render.resolution_y = 900
    scene.render.resolution_percentage = 100
    scene.view_settings.view_transform = 'Standard'

    # Warm background #F5EFE3
    if not scene.world:
        scene.world = bpy.data.worlds.new("World")
    scene.world.use_nodes = True
    bg_node = scene.world.node_tree.nodes.get("Background")
    if bg_node:
        bg_node.inputs[0].default_value = (0.961, 0.937, 0.890, 1.0)
        bg_node.inputs[1].default_value = 0.8

    # Import GLB
    bpy.ops.import_scene.gltf(filepath=STATIONS_GLB)

    # Position each object in a line along X
    spacing = 3.2
    total_count = len(STATION_ORDER)
    start_x = -((total_count - 1) * spacing) / 2.0

    min_x, max_x = float('inf'), float('-inf')
    min_y, max_y = float('inf'), float('-inf')

    for i, name in enumerate(STATION_ORDER):
        obj = bpy.data.objects.get(name)
        if not obj:
            print(f"Warning: object '{name}' not found!")
            continue

        target_x = start_x + i * spacing
        obj.location = (target_x, 0.0, 0.0)

        # Ground the object so min Z is exactly 0
        bpy.context.view_layer.update()
        min_z = min((obj.matrix_world @ v.co).z for v in obj.data.vertices)
        obj.location.z -= min_z

        for v in obj.data.vertices:
            w_co = obj.matrix_world @ v.co
            min_x = min(min_x, w_co.x)
            max_x = max(max_x, w_co.x)
            min_y = min(min_y, w_co.y)
            max_y = max(max_y, w_co.y)

    center_x = (min_x + max_x) / 2.0
    center_y = (min_y + max_y) / 2.0

    # Camera target
    target_empty = bpy.data.objects.new("CamTarget", None)
    bpy.context.collection.objects.link(target_empty)
    target_empty.location = (center_x, center_y, 1.1)

    # Sun light
    light_data = bpy.data.lights.new(name="Sun", type='SUN')
    light_data.energy = 2.8
    light_data.color = (1.0, 0.98, 0.95)
    light_obj = bpy.data.objects.new(name="Sun", object_data=light_data)
    bpy.context.collection.objects.link(light_obj)
    light_obj.location = (center_x - 20.0, center_y - 50.0, 40.0)
    track_sun = light_obj.constraints.new(type='TRACK_TO')
    track_sun.target = target_empty
    track_sun.track_axis = 'TRACK_NEGATIVE_Z'
    track_sun.up_axis = 'UP_Y'

    # Camera looking at facade from south-south-west with gentle 25 degree pitch
    cam_data = bpy.data.cameras.new(name="Camera")
    cam_data.type = 'ORTHO'
    cam_data.clip_start = 0.1
    cam_data.clip_end = 500.0

    span_x = (max_x - min_x) + 1.6
    cam_data.ortho_scale = span_x

    cam_obj = bpy.data.objects.new(name="Camera", object_data=cam_data)
    bpy.context.collection.objects.link(cam_obj)
    scene.camera = cam_obj

    dist = 60.0
    pitch = math.radians(24)  # looking down at 24 deg
    yaw = math.radians(6)     # slightly off-axis so facades dominate

    cam_obj.location = (
        center_x + dist * math.sin(yaw) * math.cos(pitch),
        center_y - dist * math.cos(yaw) * math.cos(pitch),
        1.2 + dist * math.sin(pitch),
    )

    track_cam = cam_obj.constraints.new(type='TRACK_TO')
    track_cam.target = target_empty
    track_cam.track_axis = 'TRACK_NEGATIVE_Z'
    track_cam.up_axis = 'UP_Y'

    out_file = os.path.join(OUT_DIR, "stations-contact.png")
    scene.render.filepath = out_file
    print(f"Rendering {out_file}...")
    bpy.ops.render.render(write_still=True)
    print("Render complete!")

if __name__ == "__main__":
    import mathutils
    render()
