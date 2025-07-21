# UI Testing Guide for ConnectorSelector and StarshipCrewContent

## Overview

This guide provides comprehensive manual testing procedures for the ConnectorSelector component and its integration with StarshipCrewContent in the crew console.

## Test Environment Setup

### Prerequisites

1. **Development Server**: Ensure the development server is running

   ```bash
   pnpm dev
   ```

2. **Backend Services**: Ensure the server is running with MCP server endpoints available

   ```bash
   pnpm --filter @starships/server start
   ```

3. **Test Data**: Ensure test starships and MCP server options are available in the database

### Browser Setup

- **Primary Testing**: Chrome (latest version)
- **Cross-browser Testing**: Firefox, Safari, Edge
- **Mobile Testing**: Chrome DevTools device simulation
- **Accessibility Testing**: Chrome DevTools Lighthouse, axe-core extension

## Manual Testing Checklist

### 1. Component Rendering and Layout

#### ConnectorSelector Component

- [ ] **Initial Load**: Component renders without errors
- [ ] **Loading State**: Shows loading spinner and "Loading connectors..." text initially
- [ ] **Header**: Displays "Connectors" title with plug icon
- [ ] **Search Input**: Search input with placeholder "Search connectors..." is visible
- [ ] **Dropdown Trigger**: "Select connectors..." button is visible and clickable
- [ ] **Error State**: Displays error message with retry button when API fails

#### StarshipCrewContent Integration

- [ ] **Layout Structure**: Two-column layout (350px sidebar + flexible main area)
- [ ] **Header**: Shows starship slug and back navigation
- [ ] **Sidebar**: Contains ConnectorSelector above AgentSelector
- [ ] **Main Area**: Shows empty state or chat interface based on agent selection

### 2. Functionality Testing

#### Connector Selection

- [ ] **Dropdown Open**: Clicking trigger opens dropdown with available connectors
- [ ] **Connector List**: All available connectors are displayed with correct information
- [ ] **Selection**: Clicking a connector selects/deselects it
- [ ] **Multi-select**: Multiple connectors can be selected simultaneously
- [ ] **Visual Feedback**: Selected connectors show check mark and appear in trigger button
- [ ] **Connection Status**: Connected connectors show "Connected" badge with wifi icon
- [ ] **Available Status**: Non-connected connectors show "Available" status

#### Search Functionality

- [ ] **Search Input**: Typing in search field filters connectors
- [ ] **Debounced Search**: Search is debounced (300ms delay)
- [ ] **Case Insensitive**: Search works regardless of case
- [ ] **Multiple Fields**: Search works on name, command, and ID
- [ ] **No Results**: Shows "No connectors match your search" when no matches
- [ ] **Clear Search**: Clearing search shows all connectors again

#### State Management

- [ ] **Persistence**: Selected connectors persist across page reloads
- [ ] **Synchronization**: State syncs between ConnectorSelector and StarshipCrewContent
- [ ] **Error Recovery**: Component recovers gracefully from API errors
- [ ] **Optimistic Updates**: UI updates immediately, reverts on error

#### Clear All Functionality

- [ ] **Button Visibility**: "Clear All" button appears when connectors are selected
- [ ] **Functionality**: Clicking "Clear All" deselects all connectors
- [ ] **API Calls**: Makes disconnect API calls for all selected connectors
- [ ] **Loading State**: Shows loading state during clear operation

### 3. User Experience Testing

#### Visual Design

- [ ] **Consistent Styling**: Matches overall application design system
- [ ] **Icons**: All icons render correctly (Plug, Wifi, WifiOff, etc.)
- [ ] **Badges**: Command badges show correct variants (Docker, NPX, UVX)
- [ ] **Colors**: Connection status colors are appropriate (green for connected)
- [ ] **Spacing**: Proper spacing between elements
- [ ] **Typography**: Text is readable and properly sized

#### Interactions

- [ ] **Hover States**: Interactive elements show hover effects
- [ ] **Click Feedback**: Buttons provide visual feedback when clicked
- [ ] **Loading States**: Loading spinners appear during operations
- [ ] **Smooth Animations**: Transitions are smooth and not jarring
- [ ] **Focus States**: Keyboard focus is visible and logical

#### Information Display

- [ ] **Environment Variables**: Shows required environment variables correctly
- [ ] **Command Information**: Displays command type badges
- [ ] **Connection Status**: Clear indication of connection status
- [ ] **Error Messages**: User-friendly error messages
- [ ] **Empty States**: Appropriate messages for empty states

### 4. Responsive Design Testing

#### Desktop (1920x1080)

- [ ] **Layout**: Two-column layout works properly
- [ ] **Sidebar Width**: 350px sidebar maintains fixed width
- [ ] **Content Area**: Main content area uses remaining space
- [ ] **Dropdown**: Dropdown fits within viewport
- [ ] **Text Readability**: All text is readable at this resolution

#### Tablet (768x1024)

- [ ] **Layout Adaptation**: Layout adapts appropriately for tablet
- [ ] **Touch Targets**: Interactive elements are appropriately sized for touch
- [ ] **Dropdown**: Dropdown works well with touch interaction
- [ ] **Scrolling**: Vertical scrolling works smoothly

#### Mobile (375x667)

- [ ] **Layout**: Layout stacks or adapts for mobile
- [ ] **Touch Interaction**: All interactions work with touch
- [ ] **Text Size**: Text remains readable on small screens
- [ ] **Dropdown**: Dropdown is usable on mobile
- [ ] **Navigation**: Back button is easily accessible

### 5. Accessibility Testing

#### Keyboard Navigation

- [ ] **Tab Order**: Logical tab order through all interactive elements
- [ ] **Focus Indicators**: Clear focus indicators on all focusable elements
- [ ] **Dropdown Navigation**: Arrow keys work in dropdown
- [ ] **Enter/Space**: Enter and Space keys activate buttons
- [ ] **Escape**: Escape key closes dropdown

#### Screen Reader Support

- [ ] **ARIA Labels**: Proper ARIA labels on interactive elements
- [ ] **ARIA Expanded**: Dropdown trigger has correct aria-expanded state
- [ ] **ARIA Selected**: Options have correct aria-selected state
- [ ] **Role Attributes**: Proper role attributes (listbox, option)
- [ ] **Announcements**: Screen reader announces state changes

#### Color and Contrast

- [ ] **Color Contrast**: Text meets WCAG AA contrast requirements
- [ ] **Color Independence**: Information not conveyed by color alone
- [ ] **High Contrast Mode**: Works in high contrast mode
- [ ] **Focus Indicators**: Focus indicators are visible in all modes

### 6. Error Handling Testing

#### API Errors

- [ ] **Network Failure**: Handles network failures gracefully
- [ ] **Server Errors**: Shows appropriate messages for server errors
- [ ] **Timeout**: Handles request timeouts properly
- [ ] **Retry Functionality**: Retry button works after errors
- [ ] **Error Recovery**: Component recovers after errors are resolved

#### Edge Cases

- [ ] **No Connectors**: Handles empty connector list
- [ ] **All Connected**: Handles case where all connectors are connected
- [ ] **Invalid Data**: Handles malformed API responses
- [ ] **Rapid Clicks**: Prevents issues from rapid successive clicks
- [ ] **Concurrent Operations**: Handles multiple simultaneous operations

#### Loading States

- [ ] **Initial Load**: Shows loading state on component mount
- [ ] **Operation Loading**: Shows loading during connect/disconnect operations
- [ ] **Partial Loading**: Handles partial loading states appropriately
- [ ] **Loading Indicators**: Loading indicators are visible and appropriate

### 7. Performance Testing

#### Rendering Performance

- [ ] **Initial Render**: Component renders quickly on first load
- [ ] **Re-renders**: Efficient re-rendering on state changes
- [ ] **Large Lists**: Performs well with many connectors
- [ ] **Search Performance**: Search filtering is responsive
- [ ] **Memory Usage**: No memory leaks during extended use

#### Network Performance

- [ ] **API Efficiency**: Minimal unnecessary API calls
- [ ] **Caching**: Appropriate caching of API responses
- [ ] **Concurrent Requests**: Handles multiple concurrent requests
- [ ] **Request Cancellation**: Cancels outdated requests appropriately

### 8. Integration Testing

#### StarshipCrewContent Integration

- [ ] **Component Positioning**: ConnectorSelector positioned correctly in sidebar
- [ ] **State Sharing**: Connector state shared properly with parent
- [ ] **Error Propagation**: Errors propagated to parent component
- [ ] **Loading Coordination**: Loading states coordinated between components

#### AgentSelector Integration

- [ ] **Layout Harmony**: Both selectors work well together in sidebar
- [ ] **Independent Operation**: Components don't interfere with each other
- [ ] **Shared Resources**: Efficient sharing of common resources
- [ ] **Visual Consistency**: Consistent visual design between components

### 9. Cross-Browser Testing

#### Chrome

- [ ] **Full Functionality**: All features work as expected
- [ ] **Performance**: Good performance characteristics
- [ ] **Developer Tools**: No console errors or warnings

#### Firefox

- [ ] **Feature Parity**: All features work consistently with Chrome
- [ ] **Styling**: Visual appearance matches Chrome
- [ ] **Performance**: Acceptable performance

#### Safari

- [ ] **Compatibility**: All features work on Safari
- [ ] **iOS Safari**: Works on mobile Safari
- [ ] **Webkit Quirks**: No webkit-specific issues

#### Edge

- [ ] **Modern Edge**: Works on Chromium-based Edge
- [ ] **Feature Support**: All modern features supported

## Test Scenarios

### Scenario 1: First-Time User

1. Navigate to crew console for a new starship
2. Observe initial loading state
3. See empty connector selection
4. Select first connector
5. Verify connection process
6. Confirm connector appears as connected

### Scenario 2: Existing User with Connectors

1. Navigate to crew console with existing connectors
2. Verify connected connectors are displayed
3. Add additional connector
4. Remove existing connector
5. Use Clear All functionality
6. Verify all operations complete successfully

### Scenario 3: Search and Filter

1. Open connector dropdown
2. Type search query
3. Verify filtering works
4. Clear search
5. Verify all connectors return
6. Test edge cases (no results, special characters)

### Scenario 4: Error Recovery

1. Simulate network failure
2. Verify error message appears
3. Use retry functionality
4. Verify recovery after network restoration
5. Test various error conditions

### Scenario 5: Mobile Usage

1. Access on mobile device
2. Test touch interactions
3. Verify responsive layout
4. Test dropdown on mobile
5. Verify all functionality works

## Reporting Issues

When reporting issues, include:

- **Browser and Version**
- **Screen Resolution**
- **Steps to Reproduce**
- **Expected Behavior**
- **Actual Behavior**
- **Screenshots/Videos** (if applicable)
- **Console Errors** (if any)

## Success Criteria

The UI testing is considered successful when:

- [ ] All manual test cases pass
- [ ] No critical accessibility issues
- [ ] Responsive design works on all target devices
- [ ] Cross-browser compatibility confirmed
- [ ] Performance is acceptable on slower devices
- [ ] Error handling provides clear user guidance
- [ ] Integration with existing components is seamless

## Notes

- Test with realistic data volumes
- Consider testing with slow network conditions
- Test with various user permissions/roles
- Verify behavior with different starship configurations
- Test edge cases and boundary conditions
