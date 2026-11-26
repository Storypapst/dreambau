extends Control

const Round = preload("res://scripts/round.gd")
const Profiles = preload("res://scripts/profiles.gd")
const INK := Color("#152c28")
const MOSS := Color("#315044")
const MINT := Color("#bcf1a3")
const CREAM := Color("#fff3cb")
const AMBER := Color("#ffbc6e")
const CORAL := Color("#ff9578")

var game = Round.new()
var learners = Profiles.new()
var catalog: Array = []
var recordings: Dictionary = {}
var narrator := AudioStreamPlayer.new()
var overlay := VBoxContainer.new()
var top := HBoxContainer.new()
var top_margin: MarginContainer
var status_label := Label.new()
var bottom := VBoxContainer.new()
var slot_label: Label
var choice_progress := 0.0
var ant_x := 0.5
var track_scroll := 0.0
var target_lane := 1
var bug_health := 3
var line_tiles: Array = []
var linked: Array[int] = []
var road_bug := Vector2(0.2, -0.25)
var pulse_time := 0.0
var pulse_at := Vector2.ZERO
var finished_delay := 0.0
var grace := 0.0
var prompt_fallback := ""
var slower := false
var menu_panel := PanelContainer.new()
var bottom_margin: MarginContainer
var dirty_save := false
var tile_order: Array = []
var selected_tiles: Array[int] = []

func _ready() -> void:
	var data = JSON.parse_string(FileAccess.get_file_as_string("res://catalog.json")) if FileAccess.file_exists("res://catalog.json") else null
	if data is Array:
		catalog = data
	var clips = JSON.parse_string(FileAccess.get_file_as_string("res://audio.json")) if FileAccess.file_exists("res://audio.json") else null
	if clips is Dictionary:
		recordings = clips
	add_child(narrator)
	_build_ui()
	_menu()

func _label(value: String, pts: int = 18) -> Label:
	var label := Label.new()
	label.text = value
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	label.add_theme_font_size_override("font_size", pts)
	label.add_theme_color_override("font_color", CREAM)
	return label

func _button(parent: Control, value: String, trigger: Callable) -> Button:
	var btn := Button.new()
	btn.text = value
	btn.custom_minimum_size = Vector2(0, 48)
	btn.add_theme_font_size_override("font_size", 17)
	btn.pressed.connect(trigger)
	parent.add_child(btn)
	return btn

func _padding(node: Control, padding: int) -> MarginContainer:
	var m := MarginContainer.new()
	for side in ["left","right","top","bottom"]:
		m.add_theme_constant_override("margin_" + side, padding)
	m.add_child(node)
	return m

func _build_ui() -> void:
	top_margin = _padding(top, 12)
	add_child(top_margin)
	top_margin.set_anchors_and_offsets_preset(Control.PRESET_TOP_WIDE)
	top.add_child(status_label)
	status_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	status_label.add_theme_font_size_override("font_size", 16)
	_button(top, "Pause", _pause)
	slot_label = _label("", 24)
	bottom.add_child(slot_label)
	var tools := HBoxContainer.new()
	tools.alignment = BoxContainer.ALIGNMENT_CENTER
	bottom.add_child(tools)
	_button(tools, "Noch einmal hören", func(): _speak(slower))
	_button(tools, "Langsam", func(): slower = true; _speak(true))
	bottom_margin = _padding(bottom, 8)
	add_child(bottom_margin)
	bottom_margin.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_WIDE)
	bottom_margin.grow_vertical = Control.GROW_DIRECTION_BEGIN
	var box := StyleBoxFlat.new()
	box.bg_color = Color("#18372ff9")
	box.set_corner_radius_all(18)
	menu_panel.add_theme_stylebox_override("panel", box)
	var frame := CenterContainer.new()
	frame.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(frame)
	frame.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	frame.add_child(menu_panel)
	overlay.add_theme_constant_override("separation", 9)
	var margins := _padding(overlay, 16)
	menu_panel.add_child(margins)
	resized.connect(_adapt)
	_adapt()

func _adapt() -> void:
	menu_panel.custom_minimum_size = Vector2(clampf(size.x - 30, 200, 440), 0)
	var safe_top := 0.0
	var safe_bottom := 0.0
	if OS.has_feature("mobile"):
		var safe := DisplayServer.get_display_safe_area()
		var screen := DisplayServer.screen_get_size()
		if screen.y > 0:
			safe_top = size.y * float(safe.position.y) / screen.y
			safe_bottom = size.y * float(screen.y - safe.end.y) / screen.y
	top_margin.offset_top = safe_top
	bottom_margin.offset_bottom = -safe_bottom

func _clear_panel() -> void:
	menu_panel.visible = true
	for child in overlay.get_children():
		overlay.remove_child(child)
		child.queue_free()

func _menu() -> void:
	_stop_audio()
	if dirty_save:
		dirty_save = not learners.save()
	game.status = "menu"
	top_margin.hide()
	bottom_margin.hide()
	_clear_panel()
	overlay.add_child(_label("Kieselalarm", 34))
	overlay.add_child(_label("Hör das Wort. Sammle seine Buchstaben der Reihe nach."))
	var bonus := 0
	for amount in Round.unspent(learners.active().events).values(): bonus += int(amount)
	overlay.add_child(_label("Lernprofil · " + str(learners.active().name) + ("  ·  +%d s" % bonus if bonus else ""), 16))
	if dirty_save:
		overlay.add_child(_label("Der Lernstand konnte nicht gespeichert werden.", 15))
	var launch = _button(overlay, "Strecke starten", func(): _start(false))
	launch.disabled = catalog.is_empty()
	_button(overlay, "Fehlerwörter üben", func(): _start(true))
	_button(overlay, "Lernprofil wechseln", _profiles)
	queue_redraw()

func _profiles() -> void:
	_clear_panel()
	overlay.add_child(_label("Wer spielt?", 26))
	var scroller := ScrollContainer.new()
	scroller.custom_minimum_size.y = clampf(learners.state.profiles.size() * 53, 50, 180)
	overlay.add_child(scroller)
	var names := VBoxContainer.new()
	names.size_flags_horizontal = SIZE_EXPAND_FILL
	scroller.add_child(names)
	for id in learners.state.profiles:
		var user: Dictionary = learners.state.profiles[id]
		var choose_profile := func(key: String): learners.select(key); _menu()
		_button(names, user.name, choose_profile.bind(id))
	var field := LineEdit.new()
	field.placeholder_text = "Neuer Spitzname"
	field.max_length = 32
	overlay.add_child(field)
	_button(overlay, "Profil anlegen", func(): if not field.text.strip_edges().is_empty(): learners.add(field.text); _menu())
	_button(overlay, "Zurück", _menu)

func _start(review: bool) -> void:
	game.start(catalog, learners.active().events, review)
	dirty_save = not learners.save()
	slower = false
	if game.status != "playing":
		_clear_panel()
		overlay.add_child(_label("Keine offenen Fehlerwörter." if review else "Wortschatz fehlt."))
		_button(overlay, "Zurück", _menu)
		return
	menu_panel.hide()
	top_margin.show()
	bottom_margin.show()
	ant_x = 0.5
	target_lane = 1
	road_bug = Vector2(0.19, -0.25)
	_new_wave(true)
	_prompt()

func _prompt() -> void:
	if game.review:
		_prepare_tiles()
		_tiles()
		_speak(false)
		return
	game.status = "listening"
	_clear_panel()
	var title := "Zu Fuß"
	var direction := "Tippe auf den nächsten Buchstaben. Der gepanzerte Käfer braucht drei Treffer."
	if game.mode == "kart":
		title = "Ins Dosenkart!"
		direction = "Ziehe auf die richtige Spur. Käfer neben dem Kart kannst du seitlich treffen."
	elif game.mode == "line":
		title = "Aussteigen!"
		direction = "Verbinde die Buchstaben der Reihe nach. Ziehe mit dem Finger oder tippe jeden an."
		line_tiles.clear()
		for c in game.word.text: line_tiles.append(c)
		line_tiles.shuffle()
		linked.clear()
	overlay.add_child(_label(title, 26))
	overlay.add_child(_label("%d Buchstaben" % game.word.text.length(), 19))
	overlay.add_child(_label(direction))
	_button(overlay, "Langsam anhören", func(): _speak(true))
	_button(overlay, "Los!", func(): game.status = "playing"; menu_panel.hide())
	_speak(false)
	_update_hud()

func _prepare_tiles() -> void:
	selected_tiles.clear()
	tile_order.clear()
	for c in game.word.text: tile_order.append(c)
	tile_order.shuffle()
	if "".join(tile_order) == game.word.text and tile_order.size() > 1:
		tile_order.push_back(tile_order.pop_front())

func _tiles() -> void:
	_clear_panel()
	overlay.add_child(_label("Ordne die Buchstaben", 23))
	var answer := ""
	for index in selected_tiles: answer += str(tile_order[index])
	overlay.add_child(_label(answer if not answer.is_empty() else "· · ·", 24))
	var tiles := GridContainer.new()
	tiles.columns = 5
	overlay.add_child(tiles)
	for i in tile_order.size():
		var pick := func(index: int): selected_tiles.append(index); _tiles()
		var tile := _button(tiles, tile_order[i], pick.bind(i))
		tile.custom_minimum_size.x = 42
		tile.disabled = selected_tiles.has(i)
	var undo := _button(overlay, "Letzten Buchstaben zurück", func(): selected_tiles.pop_back(); _tiles())
	undo.disabled = selected_tiles.is_empty()
	_button(overlay, "Anhören", func(): _speak(false))
	var submit := _button(overlay, "Wort prüfen", func(): _submit_review(answer))
	submit.disabled = selected_tiles.size() != tile_order.size()

func _submit_review(answer: String) -> void:
	game.submit_review(answer)
	dirty_save = not learners.save()
	if game.status == "feedback":
		_feedback()
	else:
		_review_next_button()

func _review_next_button() -> void:
	_clear_panel()
	overlay.add_child(_label(game.word.text, 28))
	_button(overlay, "Nächstes Wort", _next_review)
	finished_delay = INF

func _next_review() -> void:
	game.next_word()
	if game.status == "finished":
		_finish()
	else:
		_prompt()

func _stop_audio() -> void:
	narrator.stop()
	if DisplayServer.has_feature(DisplayServer.FEATURE_TEXT_TO_SPEECH):
		DisplayServer.tts_stop()

func _speak(slow: bool) -> void:
	if game.status not in ["playing", "feedback", "listening"]:
		return
	_stop_audio()
	prompt_fallback = ""
	if recordings.has(game.word.id):
		var recording := AudioStreamMP3.new()
		recording.data = Marshalls.base64_to_raw(recordings[game.word.id])
		narrator.stream = recording
		narrator.pitch_scale = 0.84 if slow else 1.0
		narrator.play()
	elif DisplayServer.has_feature(DisplayServer.FEATURE_TEXT_TO_SPEECH) and not DisplayServer.tts_get_voices_for_language("de").is_empty():
		var voices := DisplayServer.tts_get_voices_for_language("de")
		DisplayServer.tts_speak(str(game.word.get("speech",game.word.text)), voices[0], 100, 1.0, 0.65 if slow else 0.86)
	else:
		prompt_fallback = ("Lies: " + str(game.word.text)) if game.review or game.status == "feedback" else "Sprachausgabe nicht verfügbar."
	_update_hud()

func _pause() -> void:
	if game.status not in ["playing", "feedback", "word_done", "listening"]:
		return
	_stop_audio()
	game.pause()
	_clear_panel()
	overlay.add_child(_label("Pause", 30))
	_button(overlay, "Weiterspielen", _resume)
	_button(overlay, "Runde beenden", _finish)

func _resume() -> void:
	game.resume()
	if game.status == "feedback":
		_feedback()
	elif game.status == "listening":
		_prompt()
	elif game.review and game.status == "playing":
		_tiles()
	elif game.review and game.status == "word_done":
		_review_next_button()
	else:
		menu_panel.hide()
		if game.status == "playing":
			_speak(slower)

func _finish() -> void:
	_stop_audio()
	game.status = "finished"
	game.finalize_review()
	dirty_save = not learners.save()
	top_margin.hide()
	bottom_margin.hide()
	_clear_panel()
	overlay.add_child(_label("Ziel erreicht", 30))
	overlay.add_child(_label("%d Wörter  ·  %d Punkte" % [game.completed,game.score]))
	if game.bonus_earned > 0:
		overlay.add_child(_label("+%d Sekunden für die nächste Strecke" % game.bonus_earned))
	if not game.review:
		_button(overlay, "Fehlerwörter sortieren", func(): _start(true))
	_button(overlay, "Zur Übersicht", _menu)

func _feedback() -> void:
	_clear_panel()
	overlay.add_child(_label("%s → %s" % [game.given, game.word.text[game.cursor]], 32))
	overlay.add_child(_label(game.word.hint))
	_button(overlay, "Langsam anhören", func(): _speak(true))
	_button(overlay, "Noch einmal versuchen", _retry)
	_speak(true)

func _retry() -> void:
	game.resume_after_hint()
	if game.status == "finished":
		_finish()
		return
	if game.review:
		_prepare_tiles()
		_tiles()
	else:
		menu_panel.hide()
		_new_wave(false)
	_update_hud()

func _update_hud() -> void:
	if game.word.is_empty():
		return
	var time_text: String = "Üben" if game.review else "%ds" % ceili(game.seconds)
	var mode_text := "Wortlinie" if game.mode == "line" else ("Dosenkart" if game.mode == "kart" else "Zu Fuß")
	status_label.text = "%s  ·  %s  ·  %d" % [mode_text,time_text,game.score]
	var slots: Array[String] = []
	for i in game.word.text.length():
		slots.append(game.word.text[i] if i < game.cursor else "·")
	slot_label.text = prompt_fallback if not prompt_fallback.is_empty() else " ".join(slots)

func _choose(lane: int) -> void:
	if game.status != "playing" or lane < 0 or lane >= game.choices.size():
		return
	_pick(str(game.choices[lane]))

func _pick(letter: String) -> void:
	var previous_count: int = game.log.size()
	game.choose(letter)
	if game.log.size() != previous_count:
		dirty_save = not learners.save()
	_new_wave(false)
	match game.status:
		"feedback": _feedback()
		"word_done":
			_stop_audio()
			finished_delay = 1.0
	_update_hud()

func _new_wave(first: bool) -> void:
	choice_progress = 0.0
	grace = 1.0 if first else 0.12

func _notification(what: int) -> void:
	if what == NOTIFICATION_APPLICATION_PAUSED or what == NOTIFICATION_APPLICATION_FOCUS_OUT:
		if is_node_ready():
			_pause()

func _process(dt: float) -> void:
	if game.status == "word_done":
		finished_delay -= dt
		if finished_delay <= 0:
			game.next_word()
			if game.status == "finished":
				_finish()
			else:
				_new_wave(true)
				_prompt()
		queue_redraw()
		return
	if game.status != "playing" or game.review:
		return
	game.advance(dt)
	if game.status != "playing":
		_finish()
		return
	if game.mode == "line":
		_update_hud()
		queue_redraw()
		return
	track_scroll += dt * (130.0 if game.mode == "kart" else 55.0)
	pulse_time = maxf(0.0, pulse_time - dt)
	ant_x = move_toward(ant_x, _lane(target_lane), dt * 1.7)
	road_bug.y += dt * 0.12
	if road_bug.y > 1.15:
		bug_health = 3
		road_bug = Vector2(game.rng.randf_range(0.1,0.9), -0.1)
	if grace > 0:
		grace -= dt
	else:
		choice_progress += dt * (0.23 if game.mode == "kart" else 0.12)
		if game.mode == "kart" and choice_progress >= 1.0:
			_choose(_nearest_lane(ant_x))
		elif choice_progress >= 1.17:
			_new_wave(false)
	_update_hud()
	queue_redraw()

func _lane(index: int) -> float:
	return [0.19, 0.5, 0.81][index]

func _nearest_lane(x: float) -> int:
	return clampi(roundi((x - 0.19) / 0.31), 0, 2)

func _play_top() -> float:
	return maxf(96, top_margin.position.y + top_margin.size.y + 24)

func _player_y() -> float:
	return size.y - maxf(170, bottom_margin.size.y + 65)

func _pos(lane: int) -> Vector2:
	return Vector2(size.x * _lane(lane), lerpf(_play_top(), _player_y(), choice_progress))

func _bug_pos() -> Vector2:
	return Vector2(size.x * road_bug.x, lerpf(_play_top(),_player_y(),road_bug.y))

func _line_position(i: int) -> Vector2:
	var cols := 4 if line_tiles.size() > 6 else 3
	var total_rows := ceili(float(line_tiles.size()) / cols)
	var y_step := minf(78, (_player_y() - _play_top() - 30) / maxf(1.0, total_rows))
	var center_y := (_play_top() + _player_y()) * 0.5
	return Vector2(size.x * (float(i % cols) + 0.5) / cols, center_y + (floorf(float(i)/cols) - (total_rows - 1) * 0.5) * y_step)

func _link_at(at: Vector2) -> void:
	for i in line_tiles.size():
		if linked.has(i) or at.distance_to(_line_position(i)) > 26:
			continue
		var letter: String = line_tiles[i]
		if letter == game.word.text[game.cursor]:
			linked.append(i)
		_pick(letter)
		return

func _gui_input(event: InputEvent) -> void:
	if game.status != "playing" or game.review:
		return
	if game.mode == "line":
		if (event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and event.pressed) or (event is InputEventMouseMotion and event.button_mask & MOUSE_BUTTON_MASK_LEFT):
			_link_at(event.position)
		return
	if event is InputEventMouseMotion and game.mode == "kart" and event.button_mask & MOUSE_BUTTON_MASK_LEFT:
		target_lane = _nearest_lane(event.position.x / size.x)
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and event.pressed:
		var player_position := Vector2(ant_x*size.x, _player_y())
		var side_shot: bool = game.mode == "kart" and absf(_bug_pos().y - player_position.y) < 55 and signf(event.position.x - player_position.x) == signf(_bug_pos().x - player_position.x)
		if (event.position.distance_to(_bug_pos()) <= 32 or side_shot) and not game.review:
			pulse_at = _bug_pos()
			pulse_time = 0.25
			bug_health -= 1
			if bug_health == 0:
				road_bug = Vector2(game.rng.randf_range(0.1, 0.9), -0.2)
				game.score += 15
				bug_health = 3
		elif game.mode == "kart":
			target_lane = _nearest_lane(event.position.x / size.x)
		else:
			for i in game.choices.size():
				if event.position.distance_to(_pos(i)) < 34:
					_choose(i)
					break

func _unhandled_key_input(event: InputEvent) -> void:
	if not event is InputEventKey or not event.pressed or event.echo:
		return
	if event.keycode == KEY_ESCAPE:
		if game.status == "paused": _resume()
		else: _pause()
	elif game.status == "playing" and not game.review and game.mode != "line" and event.keycode in [KEY_1,KEY_2,KEY_3]:
		var lane: int = event.keycode - KEY_1
		if game.mode == "kart": target_lane = lane
		else: _choose(lane)

func _draw() -> void:
	draw_rect(Rect2(Vector2.ZERO, size), INK)
	for i in 25:
		var y := fposmod(i*63.0 + track_scroll, size.y + 40.0) - 20
		var x := fposmod(i*127.0, size.x)
		draw_circle(Vector2(x,y), 2.0 + i%3, MOSS)
	for k in [0.35, 0.65]:
		for i in range(-1,ceili(size.y / 72.0)+1):
			var y := i * 72.0 + fposmod(track_scroll,72.0)
			draw_line(Vector2(size.x*k,y), Vector2(size.x*k,y+22), MOSS, 1.5)
	if game.status in ["menu","empty","finished"]:
		return
	if game.mode == "line":
		for i in range(1, linked.size()):
			draw_line(_line_position(linked[i-1]), _line_position(linked[i]), MINT, 4, true)
		for i in line_tiles.size():
			var at := _line_position(i)
			draw_circle(at, 24, MINT if linked.has(i) else CREAM)
			draw_string(ThemeDB.fallback_font, at + Vector2(-22,9), line_tiles[i], HORIZONTAL_ALIGNMENT_CENTER, 44, 26, INK)
		_draw_ant(Vector2(size.x*0.5, _player_y()), Color("#cb7d57"))
		return
	var kart: bool = game.mode == "kart"
	var p := Vector2(ant_x*size.x,_player_y())
	if kart:
		draw_rect(Rect2(p-Vector2(25,26), Vector2(50,54)), AMBER)
		for a in [-1,1]:
			for b in [-1,1]:
				draw_circle(p+Vector2(a*25,b*18),8,Color("#121f1c"))
	_draw_ant(p, Color("#cb7d57"))
	if not game.review:
		_draw_beetle(_bug_pos())
	if pulse_time > 0:
		if kart: draw_line(p, pulse_at, AMBER, 2, true)
		draw_arc(pulse_at, 8+(0.25-pulse_time)*95, 0, TAU, 24, AMBER, 2)
	if game.status == "word_done":
		return
	for i in game.choices.size():
		var bubble := _pos(i)
		draw_circle(bubble+Vector2(0,3),29,Color("#0c1916"))
		draw_circle(bubble,27,CREAM)
		draw_arc(bubble,27,0,TAU,48,AMBER,2,true)
		draw_string(ThemeDB.fallback_font, bubble + Vector2(-25,10), str(game.choices[i]), HORIZONTAL_ALIGNMENT_CENTER, 50, 31, INK)

func _draw_ant(p: Vector2, color: Color) -> void:
	for side in [-1,1]:
		for i in 3:
			var at := p + Vector2(side*5, i*5-5)
			draw_line(at, at + Vector2(side*14,(i-1)*6),color,2.8,true)
		draw_line(p + Vector2(side*4,-15),p + Vector2(side*11,-23), color,2,true)
	draw_circle(p + Vector2(0,11),9,color)
	draw_circle(p,6,color)
	draw_circle(p - Vector2(0,11),8,color)
	draw_circle(p + Vector2(-3,-13),1.7,INK)
	draw_circle(p + Vector2(3,-13),1.7,INK)

func _draw_beetle(p: Vector2) -> void:
	for side in [-1,1]:
		for i in 3:
			draw_line(p+Vector2(side*4,i*4-5),p+Vector2(side*13,i*5-6),CORAL,2,true)
	draw_circle(p, 9, CORAL)
	draw_line(p-Vector2(0,6),p+Vector2(0,7),INK,1.8)
	draw_circle(p-Vector2(0,8),4,AMBER)
	for i in bug_health:
		draw_circle(p + Vector2((i-1)*5, 16), 1.8, AMBER)
