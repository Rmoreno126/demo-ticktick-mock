package com.example.demoticktickmock.repository;

import com.example.demoticktickmock.model.Task;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDateTime;
import java.util.List;
import java.time.LocalDate;

public interface TaskRepository extends JpaRepository<Task, Long> {
    List<Task> findByDueDateLessThanEqual(LocalDateTime dateTime);
    List<Task> findByDueDateBetween(LocalDateTime start, LocalDateTime end);
    List<Task> findByCompleted(boolean completed);

    void deleteByRolloverFalse();
}