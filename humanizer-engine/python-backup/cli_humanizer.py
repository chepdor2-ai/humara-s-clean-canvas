"""
Command-line humanizer - works without server/GUI
Usage: python cli_humanizer.py
"""
import sys
from humanizer import humanize

def main():
    print("=" * 60)
    print("GHOST HUMANIZER - Command Line Edition")
    print("=" * 60)
    print()
    print("Paste your AI text below (press Enter, then Ctrl+Z and Enter on Windows, or Ctrl+D on Mac/Linux when done):")
    print()
    
    # Read from stdin
    lines = []
    try:
        while True:
            line = input()
            lines.append(line)
    except EOFError:
        pass
    
    text = '\n'.join(lines).strip()
    
    if not text:
        print("No input provided.")
        return
    
    print()
    print("Select engine:")
    print("1. Ghost Mini (fast, top 5 detectors)")
    print("2. Ghost Pro (maximum quality, all detectors)")
    
    choice = input("Choice [1]: ").strip() or "1"
    mode = "ghost_pro" if choice == "2" else "ghost_mini"
    
    print()
    print("Select strength:")
    print("1. Light")
    print("2. Medium")
    print("3. Strong")
    
    strength_choice = input("Choice [2]: ").strip() or "2"
    strength_map = {"1": "light", "2": "medium", "3": "strong"}
    strength = strength_map.get(strength_choice, "medium")
    
    print()
    print(f"Processing with {mode} ({strength})...")
    print()
    
    result = humanize(text, mode=mode, strength=strength)
    
    print("=" * 60)
    print("HUMANIZED TEXT:")
    print("=" * 60)
    print(result)
    print()
    print("=" * 60)
    print(f"Word count: {len(result.split())}")
    print("=" * 60)
    
    # Ask to save
    save = input("\nSave to file? (y/n) [n]: ").strip().lower()
    if save == 'y':
        filename = input("Filename [output.txt]: ").strip() or "output.txt"
        with open(filename, 'w', encoding='utf-8') as f:
            f.write(result)
        print(f"Saved to {filename}")

if __name__ == "__main__":
    main()
