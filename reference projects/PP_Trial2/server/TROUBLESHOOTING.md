# Troubleshooting: Logs Not Generating

## Quick Checks

### 1. **Server is Running**
```powershell
netstat -ano | findstr :3001
```
Should show the server listening on port 3001.

### 2. **Test Server Manually**
```powershell
Invoke-WebRequest -Uri http://localhost:3001/health
```
Should return: `{"status":"ok",...}`

### 3. **Check Browser Console**
1. Open your HTML file in browser
2. Press F12 to open Developer Tools
3. Go to Console tab
4. Look for errors (red text)
5. Look for `[Logging]` messages

### 4. **Verify Configuration in HTML**
Open `index.html` and check around line 8259:
```javascript
const LOGGING_ENABLED = true;  // Must be true
const LOGGING_URL = 'http://localhost:3001/log';  // Must match your server
```

### 5. **Test Logging Manually**
In browser console, type:
```javascript
window.enqueueChange('testField', 'testValue');
window.flushChanges('manual-test');
```
Then check `server/logs/` for a file.

### 6. **Check if Events are Firing**
1. Open browser console
2. Make a change to a form field (text input, select, checkbox)
3. Look for `[Logging]` messages in console
4. Should see: `[Logging] Flushed X changes (reason: ...)`

## Common Issues

### Issue: "Failed to fetch" or CORS errors
**Solution:** 
- Make sure server is running
- Check `LOGGING_URL` is correct
- Server should have CORS enabled (it does by default)

### Issue: No console messages at all
**Solution:**
- Refresh the HTML page (F5) to reload JavaScript
- Check `LOGGING_ENABLED` is `true`
- Check browser console for JavaScript errors

### Issue: Events not triggering
**Solution:**
- Text inputs/textarea: Must blur (click away) to log
- Selects/checkboxes: Log on change
- Make sure form is not locked (if your app has a lock feature)

### Issue: Server errors in console
**Solution:**
- Check server console for error messages
- Look for file permission errors
- Check `server/logs/` directory exists and is writable

## Debug Steps

1. **Clear browser cache** and reload HTML
2. **Check server console** for incoming requests
3. **Test with manual flush**: `window.flushChanges('test')`
4. **Check logs directory**: `Get-ChildItem server\logs`
5. **Verify Work Order field** has a value (or will use "UNKNOWN")

## Still Not Working?

Check server console output when you make a change. You should see:
- Incoming POST requests to `/log`
- Any error messages

If you see errors, they will help identify the issue.













