package tui

import (
	"fmt"
	"strings"

	"github.com/charmbracelet/lipgloss"
)

// A2UIComponent is a generative UI component emitted by agents as JSON schemas.
type A2UIComponent struct {
	Type     string          `json:"type"`
	Children []A2UIComponent `json:"children,omitempty"`
	Props    map[string]any  `json:"props,omitempty"`
	DataRef  string          `json:"dataRef,omitempty"`
	Action   string          `json:"action,omitempty"`
}

// A2UIDataUpdate is a patch operation on the generative model's data store.
type A2UIDataUpdate struct {
	Op    string `json:"op"`
	Path  string `json:"path"`
	Value any    `json:"value,omitempty"`
}

// GenerativeModel holds a schema and its data, rendering inline TUI components.
type GenerativeModel struct {
	schema *A2UIComponent
	data   map[string]any
	width  int
}

// NewGenerativeModel creates an empty GenerativeModel.
func NewGenerativeModel() GenerativeModel {
	return GenerativeModel{data: make(map[string]any)}
}

// SetSchema replaces the current component schema.
func (g *GenerativeModel) SetSchema(schema A2UIComponent) {
	g.schema = &schema
}

// SetData replaces the current data store.
func (g *GenerativeModel) SetData(data map[string]any) {
	g.data = data
}

// ApplyUpdates applies a batch of JSON Pointer patch operations to the data store.
func (g *GenerativeModel) ApplyUpdates(updates []A2UIDataUpdate) {
	for _, u := range updates {
		switch u.Op {
		case "set":
			setPointer(g.data, u.Path, u.Value)
		case "merge":
			if sub, ok := u.Value.(map[string]any); ok {
				mergePointer(g.data, u.Path, sub)
			} else {
				setPointer(g.data, u.Path, u.Value)
			}
		case "delete":
			deletePointer(g.data, u.Path)
		}
	}
}

// View renders the current schema with resolved data.
func (g GenerativeModel) View() string {
	if g.schema == nil {
		return ""
	}
	return renderComponent(*g.schema, g.data, g.width)
}

// resolvePointer implements RFC 6901 JSON Pointer resolution.
// "/foo/bar/0" → data["foo"]["bar"][0]
func resolvePointer(data any, pointer string) any {
	if pointer == "" || pointer == "/" {
		return data
	}
	parts := strings.Split(strings.TrimPrefix(pointer, "/"), "/")
	current := data
	for _, part := range parts {
		part = strings.ReplaceAll(part, "~1", "/")
		part = strings.ReplaceAll(part, "~0", "~")
		switch v := current.(type) {
		case map[string]any:
			current = v[part]
		case []any:
			var idx int
			fmt.Sscanf(part, "%d", &idx)
			if idx >= 0 && idx < len(v) {
				current = v[idx]
			} else {
				return nil
			}
		default:
			return nil
		}
	}
	return current
}

// setPointer sets a value at the given JSON Pointer path, creating intermediate maps as needed.
func setPointer(data map[string]any, pointer string, value any) {
	if pointer == "" {
		return
	}
	parts := strings.Split(strings.TrimPrefix(pointer, "/"), "/")
	current := data
	for i, part := range parts {
		part = strings.ReplaceAll(part, "~1", "/")
		part = strings.ReplaceAll(part, "~0", "~")
		if i == len(parts)-1 {
			current[part] = value
			return
		}
		if sub, ok := current[part].(map[string]any); ok {
			current = sub
		} else {
			sub := make(map[string]any)
			current[part] = sub
			current = sub
		}
	}
}

// mergePointer merges a map into the node at the given path.
func mergePointer(data map[string]any, pointer string, value map[string]any) {
	if pointer == "" || pointer == "/" {
		for k, v := range value {
			data[k] = v
		}
		return
	}
	parts := strings.Split(strings.TrimPrefix(pointer, "/"), "/")
	current := data
	for i, part := range parts {
		part = strings.ReplaceAll(part, "~1", "/")
		part = strings.ReplaceAll(part, "~0", "~")
		if i == len(parts)-1 {
			if sub, ok := current[part].(map[string]any); ok {
				for k, v := range value {
					sub[k] = v
				}
			} else {
				current[part] = value
			}
			return
		}
		if sub, ok := current[part].(map[string]any); ok {
			current = sub
		} else {
			sub := make(map[string]any)
			current[part] = sub
			current = sub
		}
	}
}

// deletePointer removes the key at the given JSON Pointer path.
func deletePointer(data map[string]any, pointer string) {
	if pointer == "" {
		return
	}
	parts := strings.Split(strings.TrimPrefix(pointer, "/"), "/")
	current := data
	for i, part := range parts {
		part = strings.ReplaceAll(part, "~1", "/")
		part = strings.ReplaceAll(part, "~0", "~")
		if i == len(parts)-1 {
			delete(current, part)
			return
		}
		sub, ok := current[part].(map[string]any)
		if !ok {
			return
		}
		current = sub
	}
}

// renderComponent dispatches to a type-specific renderer.
func renderComponent(comp A2UIComponent, data map[string]any, width int) string {
	if width <= 0 {
		width = 80
	}
	switch comp.Type {
	case "row":
		if len(comp.Children) == 0 {
			return ""
		}
		childWidth := width / len(comp.Children)
		if childWidth < 1 {
			childWidth = 1
		}
		parts := make([]string, len(comp.Children))
		for i, child := range comp.Children {
			parts[i] = renderComponent(child, data, childWidth)
		}
		return lipgloss.JoinHorizontal(lipgloss.Top, parts...)

	case "column":
		parts := make([]string, len(comp.Children))
		for i, child := range comp.Children {
			parts[i] = renderComponent(child, data, width)
		}
		return lipgloss.JoinVertical(lipgloss.Left, parts...)

	case "card":
		title := ""
		if t, ok := comp.Props["title"].(string); ok {
			title = t
		}
		inner := make([]string, len(comp.Children))
		for i, child := range comp.Children {
			inner[i] = renderComponent(child, data, max(1, width-4))
		}
		body := strings.Join(inner, "\n")
		cardStyle := lipgloss.NewStyle().
			Border(lipgloss.RoundedBorder()).
			BorderForeground(lipgloss.Color("#374151")).
			Padding(0, 1).
			Width(max(4, width-2))
		if title != "" {
			titleLine := lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color(NexPurple)).Render(title)
			return titleLine + "\n" + cardStyle.Render(body)
		}
		return cardStyle.Render(body)

	case "text":
		val := ""
		if comp.DataRef != "" {
			resolved := resolvePointer(data, comp.DataRef)
			if resolved != nil {
				val = fmt.Sprintf("%v", resolved)
			}
		} else if s, ok := comp.Props["content"].(string); ok {
			val = s
		}
		style := lipgloss.NewStyle()
		if b, ok := comp.Props["bold"].(bool); ok && b {
			style = style.Bold(true)
		}
		if c, ok := comp.Props["color"].(string); ok && c != "" {
			style = style.Foreground(lipgloss.Color(c))
		}
		if d, ok := comp.Props["dimmed"].(bool); ok && d {
			style = style.Foreground(lipgloss.Color(MutedColor))
		}
		return style.Render(val)

	case "textfield":
		label := "input"
		if l, ok := comp.Props["label"].(string); ok && l != "" {
			label = l
		}
		return lipgloss.NewStyle().Foreground(lipgloss.Color(MutedColor)).Render("[input: " + label + "]")

	case "list":
		var items []any
		if comp.DataRef != "" {
			if resolved, ok := resolvePointer(data, comp.DataRef).([]any); ok {
				items = resolved
			}
		}
		lines := make([]string, len(items))
		for i, item := range items {
			lines[i] = "• " + fmt.Sprintf("%v", item)
		}
		return strings.Join(lines, "\n")

	case "table":
		var rows [][]string
		if comp.DataRef != "" {
			if resolved, ok := resolvePointer(data, comp.DataRef).([]any); ok {
				for _, row := range resolved {
					if r, ok := row.([]any); ok {
						cells := make([]string, len(r))
						for j, cell := range r {
							cells[j] = fmt.Sprintf("%v", cell)
						}
						rows = append(rows, cells)
					}
				}
			}
		}
		return renderTable(rows)

	case "progress":
		var val float64
		if comp.DataRef != "" {
			switch v := resolvePointer(data, comp.DataRef).(type) {
			case float64:
				val = v
			case int:
				val = float64(v)
			}
		}
		return renderProgress(val, width)

	case "spacer":
		n := 1
		if v, ok := comp.Props["lines"].(float64); ok && v > 0 {
			n = int(v)
		}
		return strings.Repeat("\n", n)
	}
	return ""
}

func renderTable(rows [][]string) string {
	if len(rows) == 0 {
		return ""
	}
	cols := 0
	for _, row := range rows {
		if len(row) > cols {
			cols = len(row)
		}
	}
	colWidths := make([]int, cols)
	for _, row := range rows {
		for j, cell := range row {
			if len(cell) > colWidths[j] {
				colWidths[j] = len(cell)
			}
		}
	}
	var sb strings.Builder
	for i, row := range rows {
		for j := 0; j < cols; j++ {
			cell := ""
			if j < len(row) {
				cell = row[j]
			}
			pad := colWidths[j] - len(cell) + 2
			sb.WriteString(cell)
			sb.WriteString(strings.Repeat(" ", pad))
		}
		if i < len(rows)-1 {
			sb.WriteString("\n")
		}
	}
	return sb.String()
}

func renderProgress(val float64, width int) string {
	if val < 0 {
		val = 0
	}
	if val > 1 {
		val = 1
	}
	barWidth := width - 8
	if barWidth < 4 {
		barWidth = 20
	}
	filled := int(val * float64(barWidth))
	empty := barWidth - filled
	bar := strings.Repeat("█", filled) + strings.Repeat("░", empty)
	return fmt.Sprintf("%s %d%%", bar, int(val*100))
}
