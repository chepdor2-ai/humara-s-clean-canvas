import re

path = r"c:\Users\User\Documents\GitHub\New folder\humara-s-clean-canvas\humanizer-engine\python-backup\humanizer.py"
with open(path, "r", encoding="utf-8") as f:
    content = f.read()

target = r"if enable_post_processing:\s*best_result = _post_process\(best_result\)\s*return best_result"
replacement = """if enable_post_processing:
        best_result = _post_process(best_result)

    if mode == "ghost_pro":
        try:
            from aggressive_stealth_post_processor import execute_aggressive_stealth_post_processing
            best_result = execute_aggressive_stealth_post_processing(best_result)
        except ImportError:
            pass

    return best_result"""

if re.search(target, content):
    content = re.sub(target, replacement, content)
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    print("Injected into humanizer.py")
else:
    print("Could not find target in humanizer.py")

path_llm = r"c:\Users\User\Documents\GitHub\New folder\humara-s-clean-canvas\humanizer-engine\python-backup\llm_humanizer.py"
with open(path_llm, "r", encoding="utf-8") as f:
    content_llm = f.read()

target_llm = r"return best_result\.strip\(\)"
replacement_llm = """try:
        from aggressive_stealth_post_processor import execute_aggressive_stealth_post_processing
        best_result = execute_aggressive_stealth_post_processing(best_result)
    except ImportError:
        pass

    return best_result.strip()"""

if re.search(target_llm, content_llm):
    content_llm = re.sub(target_llm, replacement_llm, content_llm)
    with open(path_llm, "w", encoding="utf-8") as f:
        f.write(content_llm)
    print("Injected into llm_humanizer.py")
else:
    print("Could not find target in llm_humanizer.py")
