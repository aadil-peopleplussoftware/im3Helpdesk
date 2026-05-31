using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace iM3Helpdesk.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class RemoveTodoItemShadowUserFk : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_TodoItems_Users_UserId1",
                table: "TodoItems");

            migrationBuilder.DropIndex(
                name: "IX_TodoItems_UserId1",
                table: "TodoItems");

            migrationBuilder.DropColumn(
                name: "UserId1",
                table: "TodoItems");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "UserId1",
                table: "TodoItems",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_TodoItems_UserId1",
                table: "TodoItems",
                column: "UserId1");

            migrationBuilder.AddForeignKey(
                name: "FK_TodoItems_Users_UserId1",
                table: "TodoItems",
                column: "UserId1",
                principalTable: "Users",
                principalColumn: "Id");
        }
    }
}
