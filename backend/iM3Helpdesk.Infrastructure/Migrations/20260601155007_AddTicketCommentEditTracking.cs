using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace iM3Helpdesk.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddTicketCommentEditTracking : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "EditedAt",
                table: "TicketComments",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "EditedById",
                table: "TicketComments",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_TicketComments_EditedById",
                table: "TicketComments",
                column: "EditedById");

            migrationBuilder.AddForeignKey(
                name: "FK_TicketComments_Users_EditedById",
                table: "TicketComments",
                column: "EditedById",
                principalTable: "Users",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_TicketComments_Users_EditedById",
                table: "TicketComments");

            migrationBuilder.DropIndex(
                name: "IX_TicketComments_EditedById",
                table: "TicketComments");

            migrationBuilder.DropColumn(
                name: "EditedAt",
                table: "TicketComments");

            migrationBuilder.DropColumn(
                name: "EditedById",
                table: "TicketComments");
        }
    }
}
