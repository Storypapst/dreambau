extends SceneTree

const Profiles = preload("res://scripts/profiles.gd")
var failed := false

func check(condition: bool, message: String) -> void:
	if not condition:
		failed = true
		printerr(message)

func _init() -> void:
	run.call_deferred()

func run() -> void:
	var storage_path := "user://test-" + Crypto.new().generate_random_bytes(8).hex_encode() + ".json"
	var store = Profiles.new(storage_path)
	var first: String = store.state.active
	store.active().events["example"] = {"type":"answer", "taskId":"de-rad","at":123,"correct":false}
	check(store.save(), "profile saved")
	var second: String = store.add("Mara")
	check(second != first and store.active().events.is_empty(), "learner isolation")
	store.select(first)
	var reopened = Profiles.new(storage_path)
	check(reopened.active().events.has("example") and reopened.state.profiles.size() == 2, "saved state reload")
	var arena = load("res://arena.tscn").instantiate()
	arena.learners = reopened
	root.add_child(arena)
	await process_frame
	check(arena.catalog.size() == 188, "catalog resource count")
	check(arena.recordings.size() == arena.catalog.size(), "complete MP3 bank")
	for word in arena.catalog:
		var bytes := Marshalls.base64_to_raw(str(arena.recordings.get(word.id,"")))
		check(bytes.size() > 800 and bytes.slice(0,3).get_string_from_ascii() == "ID3", "audio bytes " + str(word.id))
	arena._start(false)
	check(arena.game.status == "listening" and arena.narrator.stream is AudioStreamMP3, "first audio plays before the run")
	arena._process(12)
	check(arena.game.seconds == 85, "prompt suspends timer")
	arena._pause()
	check(arena.game.status == "paused" and not arena.narrator.playing, "true pause stops audio")
	arena._resume()
	check(arena.game.status == "listening", "pause restores prompt")
	arena.game.status = "playing"
	arena.menu_panel.hide()
	var selected: String = arena.game.word.id
	var expected: String = arena.game.word.text[0]
	var wrong: int = arena.game.choices.find(arena.game.choices.filter(func(c): return c != expected)[0])
	arena._choose(wrong)
	var clock: float = arena.game.seconds
	arena._process(12)
	check(arena.game.status == "feedback" and arena.game.seconds == clock, "wrong tap freezes game")
	arena._retry()
	while arena.game.status == "playing":
		arena._choose(arena.game.choices.find(arena.game.word.text[arena.game.cursor]))
	arena._process(2)
	check(arena.game.status == "listening" and arena.game.word.id != selected, "advance to a new audible prompt")
	arena._finish()
	arena._start(true)
	check(arena.game.review and arena.menu_panel.visible and not arena.tile_order.is_empty(), "review sorting control")
	while arena.game.status == "playing":
		arena._submit_review(arena.game.word.text)
		arena._next_review()
	check(arena.game.status == "finished" and arena.game.bonus_earned > 0, "review awards banked seconds")
	var bank: int = arena.game.bonus_earned
	arena._start(false)
	check(arena.game.seconds == 85 + bank, "next round spends bank")
	arena.game.completed = 4
	arena.game.next_word()
	arena._prompt()
	check(arena.game.mode == "line", "kart dismount enters line activity")
	arena.game.status = "playing"
	arena.menu_panel.hide()
	for c in arena.game.word.text:
		for i in arena.line_tiles.size():
			if not arena.linked.has(i) and arena.line_tiles[i] == c:
				arena._link_at(arena._line_position(i))
				break
	check(arena.game.status == "word_done" and arena.linked.size() == arena.game.word.text.length(), "finger path spells entire word")
	arena._stop_audio()
	arena.narrator.stream = null
	arena.free()
	await create_timer(1.0).timeout
	for suffix in ["",".bak",".tmp"]:
		var path = ProjectSettings.globalize_path(storage_path + suffix)
		if FileAccess.file_exists(path): DirAccess.remove_absolute(path)
	if not failed: print("188 native recordings, profile isolation, pause, error sorting and bonus redemption verified.")
	quit(1 if failed else 0)
