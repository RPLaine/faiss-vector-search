# Camera/Viewport System Implementation

## Problem Solved

The previous implementation had a dynamic canvas that grew with content, causing:
- Complex cascading recalculations when canvas height changed
- Difficult position management with scrolling
- Scrollbar in the main screen
- Race conditions between layout updates and canvas resizing

## Solution: Camera-Based Viewport

Instead of dynamically resizing the canvas and using DOM scrolling, we now use a **fixed-size viewport with camera-based navigation**:

1. **Fixed Canvas Size**: Canvas matches viewport size (never grows)
2. **Global Coordinates**: All elements have globalX/globalY coordinates
3. **Camera Object**: Single `{x, y}` offset that transforms global → screen coords
4. **Mouse Wheel Navigation**: Scrolling changes camera.y, moving all elements together

## Architecture Changes

### Canvas Manager (`public2/js/canvas-manager.js`)

**New Properties:**
```javascript
this.camera = {
    x: 0,  // Camera X offset (for future horizontal panning)
    y: 0   // Camera Y offset (changed by mouse wheel)
};

// Agent storage now uses globalX/globalY
this.agents = new Map(); // agent_id -> {globalX, globalY, element}
```

**Key Methods:**
```javascript
// Coordinate conversion
globalToScreen(globalX, globalY) → {x, y}
screenToGlobal(screenX, screenY) → {x, y}

// Mouse wheel handler
setupScrollHandler() // Changes camera.y on wheel event

// Update all element positions when camera moves
updateAllElementPositions()

// Smooth camera animation for centering
scrollAgentToCenter(agentId) // Animates camera to center agent
```

**Removed Methods:**
- `updateCanvasHeight()` - No longer needed
- `updateCanvasHeightImmediate()` - No longer needed
- Canvas no longer dynamically resizes

### Task Manager (`public2/js/task-manager.js`)

**Changed:**
- Task storage uses `globalX/globalY` instead of `x/y`
- Listens for `updateTaskScreenPositions` event from camera movements
- `updateAllTaskScreenPositions(camera)` updates all task DOM positions

### Task Controller (`public2/js/controllers/task-controller.js`)

**Changed:**
- All position calculations now:
  1. Calculate global positions
  2. Convert to screen coordinates via `globalToScreen()`
  3. Apply to DOM

### CSS (`public2/css/main.css`)

**Changed:**
- `.agents-grid`: `overflow: hidden` (no scrollbar)
- Removed all scrollbar styling (webkit-scrollbar, scrollbar-width)

## Benefits

### 1. **Simplified Position Management**
- All elements have stable global coordinates
- Screen position = simple subtraction: `screenX = globalX - camera.x`
- No complex tracking of scroll positions

### 2. **No Dynamic Canvas Resizing**
- Canvas size = viewport size (static)
- No cascading height recalculations
- No race conditions between layout and sizing

### 3. **Clean UI**
- No scrollbar visible
- Mouse wheel provides smooth navigation
- Professional, game-like viewport control

### 4. **Performance**
- Single camera object changes for all elements
- No DOM scroll events to manage
- Efficient coordinate transforms

### 5. **Future-Proof**
- Easy to add horizontal panning (camera.x)
- Easy to add zoom (scale transform)
- Easy to add minimap
- Easy to add viewport bounds/limits

## How It Works

### Element Positioning Flow

1. **Initial Layout** (global space):
   ```javascript
   agent.globalX = 100;
   agent.globalY = 200;
   ```

2. **Camera Transform** (to screen space):
   ```javascript
   screenPos = canvasManager.globalToScreen(agent.globalX, agent.globalY);
   // screenPos.x = 100 - camera.x
   // screenPos.y = 200 - camera.y
   ```

3. **DOM Update**:
   ```javascript
   element.style.left = `${screenPos.x}px`;
   element.style.top = `${screenPos.y}px`;
   ```

### Mouse Wheel Scrolling

```javascript
container.addEventListener('wheel', (e) => {
    e.preventDefault();
    
    // Move camera (positive deltaY = scroll down = camera moves up)
    this.camera.y += e.deltaY * 0.5;
    
    // Update all elements
    this.updateAllElementPositions();
    this.updateAllConnections();
});
```

### Centering Animation

```javascript
scrollAgentToCenter(agentId) {
    // Calculate target camera position to center agent
    const targetCameraY = agentCenterGlobalY - (viewportHeight / 2);
    
    // Smooth ease-out animation
    animateCamera(startY, targetY, duration);
}
```

## Connection Lines

SVG connection lines now use screen coordinates:
1. Get agent/task global positions
2. Convert both to screen coordinates
3. Draw SVG path using screen coords
4. SVG viewBox matches viewport (not expanded canvas)

## Migration Notes

### Breaking Changes
- All position references changed from `x/y` to `globalX/globalY`
- Canvas no longer grows dynamically
- DOM scrolling removed
- ScrollTop/scrollHeight no longer used

### Backwards Compatibility
None required - this is a complete architectural shift.

## Future Enhancements

Easy additions with this architecture:
- **Horizontal panning**: Use camera.x
- **Zoom**: Add camera.scale and apply to coordinates
- **Minimap**: Show camera viewport rectangle on global space
- **Bounds**: Limit camera.x/y to content bounds
- **Snap to grid**: Round global coordinates
- **Drag to pan**: Change camera on mouse drag
