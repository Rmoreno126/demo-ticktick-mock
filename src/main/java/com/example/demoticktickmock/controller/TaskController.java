package com.example.demoticktickmock.controller;

import com.example.demoticktickmock.model.Task;
import com.example.demoticktickmock.repository.TaskRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.List;

@RestController
@RequestMapping("/api/tasks")
@CrossOrigin(origins = "*")
public class TaskController {

    private final TaskRepository taskRepository;

    public TaskController(TaskRepository taskRepository) {
        this.taskRepository = taskRepository;
    }

    // Fetch all tasks
    @GetMapping
    public List<Task> getAllTasks() {
        return taskRepository.findAll();
    }

    // Fetch active tasks up to end of today
    @GetMapping("/daily")
    public List<Task> getDailyTasks() {
        LocalDateTime endOfToday = LocalDate.now().atTime(LocalTime.MAX);
        return taskRepository.findByDueDateLessThanEqual(LocalDate.from(endOfToday).atStartOfDay());
    }

    // Fetch tasks scheduled for the upcoming 7 days
    @GetMapping("/planned")
    public List<Task> getPlannedTasks() {
        LocalDateTime startOfTomorrow = LocalDate.now().plusDays(1).atStartOfDay();
        LocalDateTime endOfNextWeek = LocalDate.now().plusDays(7).atTime(LocalTime.MAX);
        return taskRepository.findByDueDateBetween(startOfTomorrow, endOfNextWeek);
    }

    @PostMapping
    public Task createTask(@Valid @RequestBody Task task) {
        if (task.getDueDate() == null) {
            task.setDueDate(LocalDateTime.now());
        }
        if (task.getTimeSlice() == null) {
            task.setTimeSlice("UNSLICED");
        }
        return taskRepository.save(task);
    }

    // -- THIS METHOD HANDLES SAVING TITLE AND DESCRIPTION ---
    @PutMapping("/{id}")
    public ResponseEntity<Task> updateTask(@PathVariable Long id, @RequestBody Task updatedData) {
        return taskRepository.findById(id).map(task -> {
            if (updatedData.getTitle() != null && !updatedData.getTitle().isBlank()) {
                task.setTitle(updatedData.getTitle());
            }
            if (updatedData.getDescription() != null) {
                task.setDescription(updatedData.getDescription());
            }
            if (updatedData.getPriority() > 0) {
                task.setPriority(updatedData.getPriority());
            }

            Task savedTask = taskRepository.save(task);
            return ResponseEntity.ok(savedTask);
        }).orElse(ResponseEntity.notFound().build());
    }

    @PutMapping("/{id}/complete")
    public ResponseEntity<Task> toggleComplete(@PathVariable Long id) {
        return taskRepository.findById(id).map(task -> {
            task.setCompleted(!task.isCompleted());
            return ResponseEntity.ok(taskRepository.save(task));
        }).orElse(ResponseEntity.notFound().build());
    }

    @PutMapping("/{id}/rollover")
    public ResponseEntity<Task> toggleRollover(@PathVariable Long id) {
        return taskRepository.findById(id).map(task -> {
            task.setRollover(!task.isRollover());
            return ResponseEntity.ok(taskRepository.save(task));
        }).orElse(ResponseEntity.notFound().build());
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteTask(@PathVariable Long id) {
        if (taskRepository.existsById(id)) {
            taskRepository.deleteById(id);
            return ResponseEntity.ok().build();
        }
        return ResponseEntity.notFound().build();
    }
}