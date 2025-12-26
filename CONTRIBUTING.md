# Contributing to TeamTape

Thank you for your interest in contributing to TeamTape! This document provides guidelines and instructions for contributing to the project.

## Code of Conduct

- Be respectful and inclusive
- Provide constructive feedback
- Accept criticism gracefully
- Focus on what's best for the community

## Getting Started

### Development Environment Setup

```bash
# Clone repository
git clone https://github.com/AhmedBaari/team-tape.git
cd team-tape

# Install dependencies
npm install

# Create .env for development
cp .env.example .env
# Edit .env with your test credentials

# Start development bot
npm run dev
```

### Required Tools

- Node.js 22.x LTS
- Git
- MongoDB (local or Atlas for testing)
- FFmpeg
- Text editor (VS Code recommended)

## Development Workflow

### 1. Create a Branch

```bash
# Update main branch
git checkout main
git pull origin main

# Create feature branch
git checkout -b feature/your-feature-name
# Or for bug fixes:
git checkout -b bugfix/issue-description
```

**Branch naming conventions:**
- `feature/*` - New features
- `bugfix/*` - Bug fixes
- `docs/*` - Documentation updates
- `refactor/*` - Code refactoring
- `test/*` - Test additions

### 2. Make Your Changes

```bash
# Edit files in src/
# Follow the coding standards below

# Test your changes locally
npm run dev
```

### 3. Commit with Conventional Commits

Follow [Conventional Commits](https://www.conventionalcommits.org/) specification:

```bash
git commit -m "feat: add new voice detection feature"
git commit -m "fix: resolve transcription timeout issue"
git commit -m "docs: update deployment guide"
git commit -m "refactor: simplify audio pipeline"
git commit -m "test: add unit tests for mongoService"
git commit -m "chore: update dependencies"
```

**Commit message format:**
```
<type>[optional scope]: <description>

[optional body]

[optional footer]
```

## Coding Standards

### JavaScript Style

- Use ES6+ features (const/let, arrow functions, destructuring)
- 2-space indentation
- Semicolons required
- Single quotes for strings (except JSON)
- JSDoc comments for functions
- Max line length: 100 characters

### Example Function

```javascript
/**
 * Validates and saves meeting record
 * Performs database integrity checks before persisting
 * @param {Object} meetingData - Meeting information
 * @param {string} meetingData.meetingId - Unique identifier
 * @param {Array} meetingData.participants - Participant list
 * @returns {Promise<Object>} Saved meeting document
 * @throws {Error} If validation fails
 */
async function saveMeeting(meetingData) {
  // Validate input
  if (!meetingData.meetingId) {
    throw new Error('meetingId is required');
  }

  // Process data
  const result = await mongoService.createMeeting(meetingData);
  
  return result;
}
```

### Error Handling

```javascript
try {
  // Operation that might fail
  const result = await someAsyncOperation();
  return result;
} catch (error) {
  // Log with context
  logger.error('Operation failed', {
    error: error.message,
    meetingId: meetingData.id,
    context: 'additional context',
  });
  
  // Re-throw or handle gracefully
  throw new Error(`Failed to complete operation: ${error.message}`);
}
```

### Comments

- Use JSDoc for all functions
- Comment complex logic
- Keep comments up-to-date with code
- Use clear, concise language

```javascript
// Good
/**
 * Calculates speaking time from transcript segments
 * @param {Array} segments - Transcript segments with timing
 * @returns {Object} Speaking time by user
 */
function calculateSpeakingTime(segments) {
  // Track cumulative time per speaker
  const timeMap = new Map();
  // ... implementation
}

// Avoid
// loop through segments (unclear)
for (const seg of segments) {
  // add to map
  timeMap.set(seg.speaker, ...);
}
```

## Testing

### Writing Tests

```bash
# Create test file alongside source
# src/services/audioRecorder.js
# src/services/__tests__/audioRecorder.test.js

# Run tests
npm test

# Run specific test file
npm test -- audioRecorder.test.js

# With coverage
npm test -- --coverage
```

### Test Structure

```javascript
import audioRecorder from '../audioRecorder';

describe('AudioRecorder', () => {
  describe('startRecording', () => {
    it('should start recording when 2+ users present', async () => {
      // Arrange
      const mockChannel = { id: '123', name: 'test' };
      
      // Act
      const result = await audioRecorder.startRecording(mockChannel, 'mtg_123');
      
      // Assert
      expect(result).toBeDefined();
      expect(result.isRecording).toBe(true);
    });
  });
});
```

## Pull Request Process

### Before Submitting

1. **Update main from upstream**

```bash
git fetch origin
git rebase origin/main
```

2. **Run tests and linting**

```bash
npm test
npm run lint
npm run format
```

3. **Write clear commit messages**

4. **Test thoroughly**
   - Manual testing
   - Edge cases
   - Error scenarios

### Submitting PR

1. **Push branch to GitHub**

```bash
git push origin feature/your-feature
```

2. **Open Pull Request**
   - Link related issues
   - Describe changes clearly
   - Include testing notes
   - Add screenshots if UI changes

3. **PR Title Format**

```
feat: add meeting auto-join functionality
fix: resolve transcription timeout
docs: update installation guide
```

### PR Template

```markdown
## Description
Brief description of changes

## Related Issues
Closes #123

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
- [ ] Unit tests added
- [ ] Manual testing completed
- [ ] Tested on latest Node.js

## Checklist
- [ ] Code follows style guidelines
- [ ] Comments added for complex logic
- [ ] Documentation updated
- [ ] No new warnings generated
- [ ] Tests pass locally
```

### Review Process

- Maintainers will review within 5 days
- Address feedback constructively
- Push updates to same branch
- Avoid force-pushing (unless requested)

## Project Structure

```
src/
  commands/        # Slash command handlers
  events/          # Discord event listeners
  services/        # Business logic services
  models/          # Database schemas
  utils/           # Utility functions
  index.js         # Main bot file
```

## Key Files to Know

- `src/index.js` - Bot entry point and command registration
- `src/services/audioRecorder.js` - Voice channel recording
- `src/services/perplexityService.js` - AI integration
- `src/models/Meeting.js` - Database schema

## Architecture Decisions

### Why MongoDB?
- Document structure matches meeting data
- Flexible schema for growing features
- Atlas free tier for development
- Good Discord bot ecosystem support

### Why Perplexity API?
- Superior reasoning capabilities
- Contextual understanding of meetings
- Cost-effective for meeting summaries
- Web search capability for cited summaries

### Why Discord.js v14?
- Latest stable with gateway intents
- Rich voice API support
- Active community
- Type-safe with TypeScript support

## Common Tasks

### Adding a New Command

1. Create `src/commands/my-command.js`

```javascript
import { SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('my-command')
  .setDescription('What this command does');

export async function execute(interaction) {
  // Command logic
  await interaction.reply('Response');
}
```

2. Command automatically loads in `src/index.js`

### Adding a New Service

1. Create `src/services/myService.js`
2. Export singleton instance
3. Use in commands/events

```javascript
class MyService {
  async doSomething() { /* ... */ }
}

const myService = new MyService();
export default myService;
```

### Adding Tests

1. Create `src/services/__tests__/myService.test.js`
2. Use Jest with clear test cases
3. Run: `npm test`

## Reporting Issues

### Bug Report

```markdown
## Description
Clear description of the bug

## Steps to Reproduce
1. Start the bot
2. Join voice channel
3. Run /start-recording

## Expected Behavior
But should work

## Actual Behavior
Crashes with error

## Environment
- Node: 22.0.0
- Discord.js: 14.14.1
- OS: macOS

## Logs
```
error logs here
```
```

### Feature Request

```markdown
## Description
Feature you'd like to see

## Use Case
Why you need this

## Proposed Solution
How it should work

## Alternatives
Other approaches considered
```

## Documentation

### Update README

- Keep setup instructions current
- Document new features
- Add troubleshooting steps
- Include examples

### Code Comments

- Explain "why" not "what"
- Keep synchronized with code
- Use clear language

## Performance Considerations

- Profile before optimizing
- Avoid unnecessary database calls
- Cache frequently accessed data
- Monitor memory usage for long recordings
- Implement rate limiting

## Security

- Never commit secrets or API keys
- Use environment variables
- Validate all user input
- Sanitize Discord IDs
- Regular dependency updates

## Releases

Maintainers follow semantic versioning:
- Major: Breaking changes
- Minor: New features
- Patch: Bug fixes

## Recognition

Contributors will be:
- Added to `CONTRIBUTORS.md`
- Mentioned in release notes
- Acknowledged in README

## Questions?

- Check [GitHub Discussions](https://github.com/AhmedBaari/team-tape/discussions)
- Open an [issue](https://github.com/AhmedBaari/team-tape/issues)
- Review [documentation](https://github.com/AhmedBaari/team-tape/wiki)

---

**Thank you for contributing to TeamTape! 🎉**
