package com.example.demoticktickmock;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class DemoTicktickMockApplication {

    public static void main(String[] args) {
        SpringApplication.run(DemoTicktickMockApplication.class, args);
    }

}
