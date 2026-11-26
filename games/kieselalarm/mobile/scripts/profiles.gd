extends RefCounted
## Local names never leave the device. A previous valid save survives an interrupted rename.

var path: String
var state: Dictionary

func _init(location := "user://learners.json") -> void:
	path = location
	for candidate in [path, path + ".bak"]:
		if not FileAccess.file_exists(candidate):
			continue
		var decoded = JSON.parse_string(FileAccess.get_file_as_string(candidate))
		if decoded is Dictionary and decoded.get("profiles") is Dictionary and decoded.profiles.has(decoded.get("active","")):
			state = decoded
			return
	state = {"active":"", "profiles":{}}
	add("Gast")

func add(display_name: String) -> String:
	var id := Crypto.new().generate_random_bytes(16).hex_encode()
	var name := display_name.strip_edges().left(32)
	state.profiles[id] = {"name": "Gast" if name.is_empty() else name, "events": {}}
	state.active = id
	save()
	return id

func select(id: String) -> void:
	if state.profiles.has(id):
		state.active = id
		save()

func active() -> Dictionary:
	return state.profiles[state.active]

func save() -> bool:
	var file := FileAccess.open(path + ".tmp", FileAccess.WRITE)
	if file == null:
		return false
	file.store_string(JSON.stringify(state))
	file.flush()
	var success := file.get_error() == OK
	file.close()
	if not success:
		return false
	var absolute := ProjectSettings.globalize_path(path)
	if FileAccess.file_exists(path):
		if FileAccess.file_exists(path + ".bak"):
			DirAccess.remove_absolute(absolute + ".bak")
		if DirAccess.rename_absolute(absolute, absolute + ".bak") != OK:
			return false
	return DirAccess.rename_absolute(absolute + ".tmp", absolute) == OK
