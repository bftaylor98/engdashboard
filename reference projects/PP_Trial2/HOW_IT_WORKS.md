# How the Process Packet Form Works - A Non-Technical Guide

This document explains how the Process Packet form is built and how it interacts with data sources. It's written for someone with no coding knowledge who needs to understand the system years from now.

## Overview: What Is This Form?

The Process Packet form is a single HTML file that contains everything needed to create and manage CNC program setup sheets. Think of it like a digital form that you fill out on your computer, similar to filling out a paper form, but with many helpful features built in.

## The Single File Architecture

### What Does "Single File" Mean?

The entire form is contained in one HTML file called `index.html`. This file includes:
- All the visual design (colors, fonts, layout)
- All the functionality (buttons, calculations, tools)
- All the data you enter (stored inside the file when you save)

**Why This Matters:**
- You don't need to install any software
- You don't need multiple files - everything is in one place
- You can move, copy, or email the file and everything comes with it
- It works entirely offline (except for some optional features that connect to databases)

### How Data Is Stored

When you save the form, all your information is stored inside the HTML file itself. It's like writing your answers on a paper form, but the "paper" is a computer file.

**The Technical Part (Simplified):**
- At the bottom of the HTML file, there's a special section that contains all your data in a format called JSON (think of it as a very organized way to write down information)
- When you open a saved file, the form reads this data section and fills in all the fields
- When you save, it updates this data section with your current information

**What This Means for You:**
- Each saved form is a complete, self-contained file
- Images are stored inside the file (converted to text format)
- Shapes and annotations are stored inside the file
- You never need to worry about losing separate files or images

## How the Form Interacts with Data Sources

The form can work in two ways: completely offline, or connected to external data sources for additional features.

### Offline Mode (Default)

Most of the form works without any internet connection or external systems:

- **Reference Data**: Dropdown menus (materials, fixtures, cooling types, etc.) have their options built into the form itself
- **Tool Library**: A library of 36 common tools is built into the form
- **Calculations**: All time calculations and formatting happen in your browser
- **File Operations**: Saving and opening files uses your computer's file system

**Where This Data Lives:**
- Inside the HTML file itself, in a section called `referenceData`
- This is like having a small reference book built into the form

### Connected Mode (Optional Features)

Some features connect to external systems:

#### 1. C-ID Lookup and Stock Checking

**What It Does:**
- Looks up tool information from a company database
- Checks stock levels for tools
- Gets current prices for tools

**How It Works:**
- When you enter a C-ID (like "C-1" or "C-112"), the form sends a request to a special server
- This server connects to the company's ZOLLER database (a tool management system)
- The server looks up the information and sends it back to the form
- The form then displays the information (description, part number, price, stock level)

**The Connection Chain:**
```
Your Form → Python Server (cid_api_server.py) → SQL Server Database → ZOLLERDB3 Database
```

**What You Need to Know:**
- The server must be running on IP address `192.168.1.193` (or `localhost` for testing)
- The server runs on port 5055
- If the server isn't running, these features won't work, but the rest of the form still works fine
- The server uses read-only access to the database (it can only read information, not change it)

**Configuration:**
- The form is configured to connect to: `http://192.168.1.193:5055` (or `http://localhost:5055` for testing)
- This address is set in the form code and can be changed if needed

#### 2. Request Assistance and Form Feedback

**What It Does:**
- Sends messages to other programmers or submits feedback

**How It Works:**
- When you submit a request or feedback, the form sends it to a Microsoft Power Automate workflow
- Power Automate is a Microsoft service that can send emails, notifications, or trigger other actions
- The form sends the information via HTTP POST (a standard way for web forms to send data)

**The Connection Chain:**
```
Your Form → Internet → Microsoft Power Automate → Email/Notification System
```

**What You Need to Know:**
- This requires an internet connection
- The Power Automate workflow URL is configured in the form code
- If Power Automate is unavailable, you'll see an error message

#### 3. Edit Logging (Background Feature)

**What It Does:**
- Automatically tracks changes made to the form
- Creates log files that record what was changed and when

**How It Works:**
- As you make changes, the form collects information about what changed
- Every 10 seconds (or when you save), it sends this information to a logging server
- The server saves it to log files (one file per work order number)

**The Connection Chain:**
```
Your Form → Node.js Server (server.js at 192.168.1.193:3001) → Log Files (server/logs/)
```

**What You Need to Know:**
- This runs completely in the background - you don't see it happening
- The server must be running on IP address `192.168.1.193` on port 3001 for logging to work
- Log files are stored in the `server/logs/` directory
- If the server isn't running, the form still works, but changes aren't logged

## How Calculations Work

### Time Calculations

**Operation Runtime:**
1. The form looks at all tools in an operation
2. It reads the runtime for each tool (like "3m" or "1hr 45m")
3. It converts all times to minutes
4. It adds them all together
5. It converts back to readable format (like "2hrs 15m")
6. It displays this in the operation runtime field

**Total Runtime:**
1. The form looks at all operations
2. It gets the runtime for each operation
3. It adds them all together
4. It displays this in the total runtime field

**When Calculations Happen:**
- Automatically whenever you change a tool runtime
- Automatically when you add or remove tools
- Automatically when you load a saved file

### Tooling Value Calculations

**How It Works:**
1. The form looks at all C-IDs in all operations
2. For each C-ID, it sends a request to the C-ID lookup server
3. The server looks up the price in the database
4. The form adds up all the prices
5. It displays the total value

**When Calculations Happen:**
- Automatically when the form is locked
- Can be triggered manually using the Stock Check widget

## How File Operations Work

### Saving Files

**Using File System Access API (Chrome/Edge):**
1. You click "Save" or "Save As"
2. Your browser asks where to save the file
3. The form collects all your data
4. It creates a complete HTML file with your data embedded in it
5. It saves the file to your chosen location

**Using Download Method (Other Browsers):**
1. You click "Download"
2. The form creates the HTML file with your data
3. Your browser downloads it to your Downloads folder
4. You can then move it wherever you want

### Opening Files

1. You click "Open"
2. Your browser lets you select a file
3. The form reads the HTML file
4. It finds the data section at the bottom
5. It extracts all the information
6. It fills in all the form fields
7. It displays all images and shapes

## How Widgets Work

Widgets are the tools in the sidebar on the right side of the form.

### Widget Visibility

**When Form is Unlocked:**
- Shape Palette (for adding annotations)
- Workholding Palette (for adding workholding items)
- Text Formatting (for formatting text)
- TMS Tools (for database lookups)
- Operations Functions (for managing operations)
- Quick Links (for external resources)
- Tool Import (for importing from Excel)

**When Form is Locked:**
- Milling Calculator
- Drilling Calculator
- Metric Converter
- Request Assistance
- Form Feedback
- Quick Links (simplified version)

**Why Different Widgets:**
- When unlocked, you're editing, so you get editing tools
- When locked, you're viewing, so you get calculation and communication tools

### Widget State Management

- All widgets start collapsed (hidden)
- Only one widget can be expanded at a time
- Clicking a widget header expands it and collapses the previously expanded one
- This keeps the sidebar organized and not cluttered

## How Images Work

### Image Storage

**The Problem:**
- Images are usually separate files
- If you move a form file, you might lose the images
- If you email a form, you need to attach images separately

**The Solution:**
- Images are converted to a text format called "base64"
- This text representation of the image is stored inside the HTML file
- When you open the file, the form converts this text back into an image

**What This Means:**
- Images are always with the form file
- No separate image files to manage
- File sizes can be larger, but everything is in one place

### Image Management

- You can upload images from your computer
- You can paste images from your clipboard (great for screenshots)
- Each operation can have multiple images
- You can navigate between images with arrow buttons
- Images are stored in order (Image 1, Image 2, etc.)

## How Shapes and Annotations Work

### Shape Storage

- Each shape has properties: type (circle, arrow, etc.), position (x, y), size (width, height), rotation angle
- These properties are stored in the data section of the HTML file
- When you open a file, the form reads these properties and redraws the shapes

### Shape Operations

**Placing Shapes:**
1. You drag a shape from the palette
2. You drop it on an operation's image area
3. The form records where you dropped it
4. It draws the shape at that location

**Moving/Resizing/Rotating:**
1. You interact with the shape (drag, resize handle, rotation handle)
2. The form updates the shape's properties
3. These properties are saved when you save the file

**Deleting Shapes:**
1. You click the X button on a shape
2. The form removes it from the data
3. It disappears from the display

## How Tool Import Works

### Excel File Processing

1. You select an Excel file
2. The form uses a library called "SheetJS" to read the Excel file
3. It looks for header rows (rows that indicate the start of a new operation)
4. It groups tools between header rows
5. It cleans up the data (formats numbers, converts times, etc.)
6. It shows you a preview
7. You select which operations to import to
8. It imports the tools in order (first group to first selected operation, etc.)

### Data Cleaning

- Stickout values are rounded to 2 decimal places
- Radius values are cleaned (removes leading zeros)
- Empty radius values become "N/A"
- "Off" coolant values are left blank
- Runtime values are converted from HH:MM:SS format to readable format

## How Autocomplete Works

### Tab-Key Completion

1. You start typing in an autocomplete field
2. As you type, suggestions appear in a dropdown
3. When you press Tab, the form looks for a suggestion that starts with what you typed
4. If it finds a match, it fills in the complete value
5. Your cursor moves to the next field

### Custom Values

- You can always type your own custom values
- Autocomplete is just a helper, not a restriction
- If you type something that doesn't match, it uses what you typed

## How Theming Works

### Theme Detection

- The form watches the "Programmed For" field
- When you select "Mazak", it adds a CSS class called "mazak-theme" to the page
- When you select "Hurco" (or anything else), it removes that class

### Theme Application

- All colors are defined in CSS (Cascading Style Sheets)
- There are two sets of colors: default (Hurco/blue) and Mazak (orange)
- When the mazak-theme class is present, the orange colors are used
- When it's not present, the blue colors are used

**What Changes:**
- Background gradient
- Button colors
- Border colors
- Accent colors throughout the form

## How Lock/Unlock Works

### Lock State

- Form starts locked (protected)
- Most editing is disabled when locked
- Some features are hidden when locked
- Some features are only available when locked

### Unlock Process

1. You click the unlock button (or press ALT+L)
2. A password dialog appears
3. You enter your password
4. The form checks the password against a list of user passwords
5. If it matches, it identifies you and unlocks the form
6. Your name appears in the header

### Lock Process

1. You click the lock button (or press ALT+L)
2. Form immediately locks (no password needed to lock)
3. All editing features are disabled
4. Viewing features remain available

### Auto-Lock

- A timer starts when you unlock the form
- After 3 minutes of no activity, the form automatically locks
- Any activity (typing, clicking, etc.) resets the timer

## How Data Validation Works

### Required Fields

- The form checks certain fields to make sure they're filled in
- Required fields in tooling tables: T#, Description, Rad, S.O., Holder, Cooling, Time
- If a required field is empty, it gets a red border
- This helps prevent incomplete data

### Field Formatting

- Some fields automatically format their values
- Runtime fields convert times to readable format
- Number fields only accept numbers
- Text fields have character limits

## Summary: The Big Picture

The Process Packet form is like a smart digital form that:

1. **Stores Everything in One File**: All your data, images, and annotations are saved inside a single HTML file
2. **Works Mostly Offline**: Most features work without any internet connection
3. **Can Connect to Databases**: Optional features connect to company databases for tool lookups and stock checking
4. **Automatically Calculates**: Times and values are calculated automatically
5. **Helps You Work Faster**: Autocomplete, tool library, and import features save time
6. **Protects Your Work**: Lock system prevents accidental changes
7. **Tracks Changes**: Background logging records what was changed (invisible to you)

The form is designed to be self-contained and portable - you can use it on any computer with a modern web browser, and all your work travels with the file. Optional features that require servers or internet connections will simply be unavailable if those connections aren't present, but the core form will always work.

