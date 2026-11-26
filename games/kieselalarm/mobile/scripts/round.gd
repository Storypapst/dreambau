extends RefCounted
## One listening round. The arena owns presentation, audio, collisions and storage.

var catalog: Array = []
var log: Dictionary = {}
var word: Dictionary = {}
var choices: Array = []
var cursor := 0
var completed := 0
var score := 0
var seconds := 85.0
var status := "menu"
var mode := "foot"
var given := ""
var assisted := false
var review := false
var paused_from := ""
var recent: Array = []
var reviewed := {}
var clean_review := 0
var bonus_earned := 0
var rng := RandomNumberGenerator.new()

func start(words: Array, history: Dictionary, practice := false) -> void:
	rng.randomize()
	catalog = words
	log = history
	cursor = 0
	completed = 0
	score = 0
	seconds = 85.0
	mode = "foot"
	review = practice
	recent.clear()
	reviewed.clear()
	clean_review = 0
	bonus_earned = 0
	if not review:
		var open := unspent(history)
		if not open.is_empty():
			for amount in open.values():
				seconds += amount
			_append_event({"type":"redeem","awards":open.keys()})
	if catalog.is_empty():
		status = "empty"
		return
	next_word()

func _select() -> Dictionary:
	var missed := {}
	var mastered := {}
	var latest := {}
	for e in log.values():
		if not e is Dictionary or e.get("type") != "answer" or not e.has("taskId") or e.get("assisted",false):
			continue
		var id: String = e.taskId
		if e.get("correct", false) and not e.get("review",false):
			mastered[id] = true
		if int(e.get("at", 0)) >= int(latest.get(id, 0)):
			latest[id] = e.get("at", 0)
			missed[id] = not e.get("correct", false)
	var tier_one := 0
	var tier_two := 0
	for task in catalog:
		if mastered.has(task.id):
			if task.tier == 1: tier_one += 1
			if task.tier == 2: tier_two += 1
	var tier := 1
	if tier_one >= 8:
		tier = 3 if tier_two >= 12 else 2
	var best: Array = []
	var best_weight := -100000
	for task in catalog:
		if not task is Dictionary or str(task.get("text","")).is_empty() or not task.has("id"):
			continue
		var id: String = task.id
		if review and (not missed.get(id,false) or reviewed.has(id)):
			continue
		var weight := 0
		if not review and int(task.get("tier", 1)) > tier:
			continue
		if recent.has(id):
			weight -= 200
		if missed.get(id, false):
			weight += 8
		elif not latest.has(id):
			weight += 4
		if weight > best_weight:
			best_weight = weight
			best.clear()
		if weight == best_weight:
			best.append(task)
	return {} if best.is_empty() else best[rng.randi_range(0, best.size()-1)]

func next_word() -> void:
	word = _select()
	if word.is_empty():
		status = "finished" if review else "empty"
		return
	if review:
		reviewed[word.id] = true
	recent.append(word.id)
	if recent.size() > mini(6, maxi(1,catalog.size() - 1)):
		recent.pop_front()
	mode = "foot"
	if not review:
		if completed % 5 == 4: mode = "line"
		elif completed % 5 >= 2: mode = "kart"
	cursor = 0
	assisted = false
	given = ""
	status = "playing"
	_fill_choices()

func _fill_choices() -> void:
	var correct: String = word.text[cursor]
	var pool := []
	for c in str(word.get("traps", {}).get(str(cursor), "")):
		pool.append(c)
	var letters := "aeinrstldgpmubkowfvhzcjüäö"
	var offset := rng.randi_range(0, letters.length() - 1)
	for i in letters.length():
		pool.append(letters[(i + offset) % letters.length()])
	choices = [correct]
	for c in pool:
		var option: String = str(c).to_upper() if correct == correct.to_upper() else str(c).to_lower()
		if option.length() == 1 and not choices.has(option):
			choices.append(option)
		if choices.size() == 3:
			break
	for i in range(choices.size()-1, 0, -1):
		var j := rng.randi_range(0, i)
		var temp: String = choices[i]
		choices[i] = choices[j]
		choices[j] = temp

func _event(correct: bool, selected: String, expected: String) -> void:
	var attempt := {"type":"answer", "taskId": word.id, "correct": correct, "review": review}
	if not correct:
		attempt.merge({"index": cursor, "given": selected, "expected": expected})
	_append_event(attempt)

func _append_event(data: Dictionary) -> void:
	var id := Crypto.new().generate_random_bytes(16).hex_encode()
	data.at = int(Time.get_unix_time_from_system() * 1000.0)
	log[id] = data

static func unspent(history: Dictionary) -> Dictionary:
	var awards := {}
	var spent := {}
	for id in history:
		var e = history[id]
		if not e is Dictionary: continue
		if e.get("type") == "award" and int(e.get("seconds",0)) > 0:
			awards[id] = int(e.seconds)
		elif e.get("type") == "redeem":
			for key in e.get("awards",[]): spent[key] = true
	for id in spent: awards.erase(id)
	return awards

func finalize_review() -> void:
	if review and clean_review > 0 and bonus_earned == 0:
		bonus_earned = clean_review * 5 * (3 if clean_review >= 5 else 2 if clean_review == 4 else 1)
		_append_event({"type":"award","seconds":bonus_earned})

func submit_review(answer: String) -> void:
	if not review or status != "playing" or answer.length() != word.text.length():
		return
	if answer != word.text:
		for i in answer.length():
			if answer[i] != word.text[i]:
				cursor = i
				given = answer[i]
				_event(false,given,word.text[i])
				break
		assisted = true
		status = "feedback"
		return
	cursor = word.text.length()
	completed += 1
	if not assisted:
		clean_review += 1
		_event(true,"","")
	status = "word_done"

func choose(letter: String) -> void:
	if review or status != "playing" or (mode != "line" and not choices.has(letter)) or letter.length() != 1:
		return
	var expected: String = word.text[cursor]
	if letter != expected:
		score -= 10
		seconds = maxf(0, seconds - 2)
		given = letter
		assisted = true
		_event(false, letter, expected)
		status = "feedback"
		return
	cursor += 1
	score += 10
	if cursor == word.text.length():
		completed += 1
		score += 50
		seconds += 4
		if not assisted:
			_event(true, "", "")
		status = "word_done"
	else:
		_fill_choices()

func advance(dt: float) -> void:
	if status != "playing" or review:
		return
	seconds = maxf(0, seconds - dt)
	if seconds == 0:
		status = "finished"

func pause() -> void:
	if status in ["playing", "feedback", "word_done", "listening"]:
		paused_from = status
		status = "paused"

func resume() -> void:
	if status == "paused":
		status = paused_from

func resume_after_hint() -> void:
	if status == "feedback":
		if not review and seconds <= 0:
			status = "finished"
			return
		if review: cursor = 0
		status = "playing"
		_fill_choices()
