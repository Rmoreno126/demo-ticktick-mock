package com.example.demoticktickmock.service;

import com.example.demoticktickmock.model.Task;
import com.example.demoticktickmock.repository.TaskRepository;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import jakarta.transaction.Transactional;

import java.util.List;

@Service
public class TaskCleanupService {

    private final TaskRepository taskRepository;

    public TaskCleanupService(TaskRepository taskRepository) {
        this.taskRepository = taskRepository;
    }

    // Cron expression: Seconds, Minutes, Hours, Day of month, Month, Day of week
    // "0 0 4 * * ?" means exactly 4:00:00 AM every single day.
    @Transactional
    @Scheduled(cron = "0 0 4 * * ?")
    public void wipeDailyTasks() {
// 1. Delete tasks not marked for rollover
        taskRepository.deleteByRolloverFalse();

        // 2. Reset the rollover flag for surviving tasks so they must be re-selected tomorrow
        List<Task> survivingTasks = taskRepository.findAll();
        for (Task task : survivingTasks) {
            task.setRollover(false);
        }
        taskRepository.saveAll(survivingTasks);

        System.out.println("4:00 AM Fresh Start: Unmarked tasks cleared, rollover states reset.");    }
}