# Auto Startup Setup Guide

This guide explains how to automatically start VS Code and run `npm run dev` when your system boots up.

## Files Included

- `start-dev.sh` - Main bash script (works on Linux, macOS, Git Bash, WSL)
- `start-dev.bat` - Windows batch wrapper (for Windows startup)
- `AUTO_STARTUP_SETUP.md` - This setup guide

## How It Works

1. **System Startup** → Triggers the startup script
2. **VS Code Opens** → Opens at the project directory
3. **Wait Period** → Allows VS Code to initialize (5 seconds)
4. **npm run dev** → Automatically starts the development server

The script will keep running as long as `npm run dev` is active. When you stop the dev server (Ctrl+C), the script exits.

---

## Setup Instructions by Operating System

### Linux (Ubuntu/Debian/GNOME)

#### Step 1: Make the script executable
```bash
chmod +x start-dev.sh
```

#### Step 2: Test the script manually
```bash
./start-dev.sh
```

#### Step 3: Add to Startup Applications

**Method A: Using GUI (GNOME)**
1. Open "Startup Applications" (search in Activities)
2. Click "Add" or "+"
3. Fill in:
   - **Name**: GMS Dev Server
   - **Command**: `/bin/bash /full/path/to/start-dev.sh`
   - **Comment**: Auto-start VS Code and dev server
4. Click "Add"

**Method B: Using systemd (Recommended for advanced users)**
```bash
# Create systemd user service
mkdir -p ~/.config/systemd/user
cat > ~/.config/systemd/user/gms-dev.service << EOF
[Unit]
Description=GMS Development Server
After=graphical-session.target

[Service]
Type=simple
ExecStart=/bin/bash /full/path/to/start-dev.sh
Restart=on-failure
Environment=DISPLAY=:0

[Install]
WantedBy=default.target
EOF

# Enable and start the service
systemctl --user enable gms-dev.service
systemctl --user start gms-dev.service
```

**Method C: Using .bashrc/.profile (Simple but runs on every terminal)**
```bash
# Add to ~/.bashrc (only runs if auto-login terminal is enabled)
echo '/full/path/to/start-dev.sh' >> ~/.bashrc
```

---

### macOS

#### Step 1: Make the script executable
```bash
chmod +x start-dev.sh
```

#### Step 2: Test the script manually
```bash
./start-dev.sh
```

#### Step 3: Add to Login Items

**Method A: Using System Preferences**
1. Open "System Preferences" → "Users & Groups"
2. Select your user account
3. Go to "Login Items" tab
4. Click "+" button
5. Navigate to and select `start-dev.sh`
6. Ensure it's checked in the list

**Method B: Using launchd (Recommended)**
```bash
# Create launchd plist file
cat > ~/Library/LaunchAgents/com.goyalsons.dev.plist << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.goyalsons.dev</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>/full/path/to/start-dev.sh</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <false/>
    <key>StandardOutPath</key>
    <string>/tmp/gms-dev.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/gms-dev.error.log</string>
</dict>
</plist>
EOF

# Load the launch agent
launchctl load ~/Library/LaunchAgents/com.goyalsons.dev.plist

# Start it immediately (optional)
launchctl start com.goyalsons.dev
```

**To remove later:**
```bash
launchctl unload ~/Library/LaunchAgents/com.goyalsons.dev.plist
rm ~/Library/LaunchAgents/com.goyalsons.dev.plist
```

---

### Windows

#### Option 1: Using Git Bash (Recommended)

**Step 1: Make the script executable (in Git Bash)**
```bash
chmod +x start-dev.sh
```

**Step 2: Test the script manually (in Git Bash)**
```bash
./start-dev.sh
```

**Step 3: Add to Windows Startup**

1. Press `Win + R` to open Run dialog
2. Type `shell:startup` and press Enter
   - This opens: `C:\Users\YourUsername\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Startup`
3. Create a shortcut:
   - Right-click in the Startup folder
   - Select "New" → "Shortcut"
   - Browse to and select: `start-dev.bat`
   - Click "Next" → "Finish"

**Alternative: Direct Git Bash method**
1. In the Startup folder, create a shortcut
2. Target: `"C:\Program Files\Git\bin\bash.exe" -c "cd '/c/Users/aksha/Downloads/GoyalsonsManagementSystem (1)/GoyalsonsManagementSystem' && ./start-dev.sh"`
3. Start in: `C:\Program Files\Git\bin`

#### Option 2: Using WSL (Windows Subsystem for Linux)

**Step 1: Test in WSL**
```bash
# In WSL terminal
cd /mnt/c/Users/aksha/Downloads/GoyalsonsManagementSystem\ \(1\)/GoyalsonsManagementSystem
chmod +x start-dev.sh
./start-dev.sh
```

**Step 2: Create Windows shortcut for WSL**
1. Create a new file: `start-dev-wsl.bat`
2. Content:
```bat
@echo off
wsl bash -c "cd '/mnt/c/Users/aksha/Downloads/GoyalsonsManagementSystem (1)/GoyalsonsManagementSystem' && ./start-dev.sh"
```
3. Add `start-dev-wsl.bat` to Startup folder (same as Option 1, Step 3)

#### Option 3: Using Task Scheduler (Advanced)

1. Open "Task Scheduler" (search in Start menu)
2. Click "Create Basic Task"
3. Name: "GMS Dev Server"
4. Trigger: "When I log on"
5. Action: "Start a program"
6. Program: `C:\Program Files\Git\bin\bash.exe`
7. Arguments: `-c "cd '/c/path/to/project' && ./start-dev.sh"`
8. Finish

---

## Configuration

### Adjust Wait Time

If VS Code takes longer to open, edit `start-dev.sh` and change:
```bash
WAIT_TIME=5  # Change to higher value (e.g., 10)
```

### Change Project Path

The script auto-detects the path from its location. To set a custom path, edit `start-dev.sh`:
```bash
PROJECT_PATH="/custom/path/to/project"
```

### Customize VS Code Command

If VS Code is installed in a non-standard location, the script will try alternative methods. You can also:
1. Add VS Code to your system PATH, or
2. Modify the script to use your VS Code installation path directly

---

## Troubleshooting

### Script doesn't run on startup

- **Linux/macOS**: Check script permissions (`chmod +x start-dev.sh`)
- **Windows**: Check that Git Bash or WSL is installed and in PATH
- Verify the path in startup configuration is correct (use absolute path)

### VS Code doesn't open

- Ensure VS Code is installed
- Check if `code` command is in PATH: `which code` (Linux/macOS) or `where code` (Windows)
- On Windows, try adding VS Code to PATH:
  1. VS Code → View → Command Palette
  2. Type "Shell Command: Install 'code' command in PATH"
  3. Restart terminal

### npm run dev doesn't start

- Check if Node.js is installed: `node --version`
- Check if dependencies are installed: `npm install`
- Verify `package.json` exists and has a `dev` script
- Check script logs for errors

### Script runs but terminal closes immediately

- **Windows**: Remove `pause` from `start-dev.bat` or use Task Scheduler
- **Linux/macOS**: Ensure the script is running in a persistent environment (not a temporary shell)

### Permission denied errors

```bash
chmod +x start-dev.sh
```

### Path with spaces not working

The script handles spaces, but if issues occur:
- Use quotes around paths
- Escape spaces with backslashes
- Use forward slashes even on Windows (Git Bash/WSL)

---

## Security Notes

- The script runs with your user permissions
- Ensure only you have write access to the script
- Review the script before adding to startup
- Don't run scripts from untrusted sources

---

## Uninstalling

### Linux (systemd)
```bash
systemctl --user stop gms-dev.service
systemctl --user disable gms-dev.service
rm ~/.config/systemd/user/gms-dev.service
```

### macOS (launchd)
```bash
launchctl unload ~/Library/LaunchAgents/com.goyalsons.dev.plist
rm ~/Library/LaunchAgents/com.goyalsons.dev.plist
```

### Windows
1. Open `shell:startup` folder
2. Delete the shortcut to `start-dev.bat` or `start-dev-wsl.bat`

---

## Additional Notes

- The script keeps running while `npm run dev` is active
- To stop: Press Ctrl+C in the terminal where it's running
- Logs can be redirected to files for debugging (see macOS launchd example)
- Multiple projects can be configured by creating multiple scripts with different paths

