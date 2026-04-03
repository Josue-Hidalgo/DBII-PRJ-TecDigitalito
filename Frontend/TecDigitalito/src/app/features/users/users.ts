import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService } from '../../core/services/api.service';

@Component({
  selector: 'app-users',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './users.html',
  styleUrls: ['./users.css']
})

export class UsersComponent implements OnInit {

  users: any[] = [];

  constructor(private api: ApiService) {}

  ngOnInit(): void {
    this.loadUsers();
  }

  loadUsers(): void {
    this.api.getTest().subscribe({
      next: (res) => {
        this.users = res.data;
      },
      error: (err) => console.error(err)
    });
  }
}